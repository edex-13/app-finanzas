-- =============================================================
-- rpc_delete_financial_transaction.sql
-- Borrar una transacción debe REVERTIR su efecto sobre saldos, no solo
-- eliminar la fila (antes el cliente hacía un delete plano y los saldos
-- quedaban descuadrados; además "editar monto = borrar y recrear" duplicaba
-- el efecto). Reversión por tipo:
--   income        -> resta de la cuenta lo que había sumado
--   expense       -> devuelve a la cuenta (si fue con cuenta); si fue con
--                    tarjeta el saldo es derivado: basta recomputar
--   debt_payment  -> devuelve a la cuenta, sube remaining_balance de la deuda,
--                    +1 cuota restante y la cuota vuelve a 'pending'
--   card_payment  -> devuelve a la cuenta y recomputa la tarjeta
--   transfer      -> deshace ambos movimientos
--   adjustment    -> NO reversible (no guardamos el saldo anterior): solo
--                    borra la fila
-- Si la transacción pagó una cuota CON tarjeta (expense + debt_id +
-- debt_installment_id + credit_card_id) se revierte la deuda, la cuota y se
-- recomputa la tarjeta.
-- =============================================================

create or replace function public.delete_financial_transaction(p_tx_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx public.transactions%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_tx
    from public.transactions
    where id = p_tx_id and user_id = v_uid;
  if not found then raise exception 'Transacción no encontrada'; end if;

  -- ---------- revertir efecto sobre CUENTAS ----------
  if v_tx.account_id is not null then
    if v_tx.kind = 'income' then
      update public.accounts set balance = balance - v_tx.amount
        where id = v_tx.account_id;
    elsif v_tx.kind in ('expense', 'debt_payment', 'card_payment') then
      update public.accounts set balance = balance + v_tx.amount
        where id = v_tx.account_id;
    elsif v_tx.kind = 'transfer' then
      update public.accounts set balance = balance + v_tx.amount
        where id = v_tx.account_id;
      if v_tx.counterparty_account_id is not null then
        update public.accounts set balance = balance - v_tx.amount
          where id = v_tx.counterparty_account_id;
      end if;
    end if;
    -- adjustment: sin reversión (el saldo anterior no se conoce)
  end if;

  -- ---------- revertir efecto sobre la DEUDA ----------
  if v_tx.debt_id is not null and v_tx.kind in ('debt_payment', 'expense') then
    update public.debts set
      remaining_balance = least(total_amount, remaining_balance + v_tx.amount),
      remaining_installments = case
        when total_installments is not null
          then least(total_installments, coalesce(remaining_installments, 0) + 1)
        else coalesce(remaining_installments, 0) + 1
      end
      where id = v_tx.debt_id;
  end if;

  -- ---------- la cuota pagada por esta transacción vuelve a pendiente ----------
  if v_tx.debt_installment_id is not null then
    update public.debt_installments
      set status = 'pending', paid_at = null, paid_transaction_id = null
      where id = v_tx.debt_installment_id
        and user_id = v_uid
        and paid_transaction_id = v_tx.id;
  end if;

  -- ---------- borrar y recomputar la tarjeta (saldo derivado) ----------
  delete from public.transactions where id = v_tx.id;

  if v_tx.credit_card_id is not null then
    perform public.recompute_card_debt(v_tx.credit_card_id);
  end if;
end;
$$;

revoke all on function public.delete_financial_transaction(uuid) from public;
grant execute on function public.delete_financial_transaction(uuid) to authenticated;
