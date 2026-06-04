-- =============================================================
-- 20260603000004_rpc_pay_installment.sql
-- RPC atómica para pagar una cuota (deuda o tarjeta) y un helper para
-- marcar cuotas vencidas. Ambas SECURITY DEFINER con check de auth.uid().
--
-- pay_installment:
--   1. Valida que la cuota pertenezca al usuario y esté pendiente.
--   2. Descuenta de la cuenta usada (si se indica; valida saldo).
--   3. Crea una transacción debt_payment ligada a la cuota.
--   4. Marca la cuota paid + paid_at + paid_transaction_id.
--   5. Si la cuota es de una DEUDA: baja remaining_balance y
--      remaining_installments de la deuda.
--      Si es de una TARJETA: baja current_debt de la tarjeta.
-- =============================================================

create or replace function public.pay_installment(
  p_installment_id uuid,
  p_account_id     uuid default null,
  p_date           date default current_date
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inst public.debt_installments%rowtype;
  v_tx_id uuid;
  v_balance numeric;
  v_remaining numeric;
  v_remaining_inst integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_inst
    from public.debt_installments
    where id = p_installment_id and user_id = v_uid;
  if not found then raise exception 'Cuota no encontrada'; end if;
  if v_inst.status = 'paid' then raise exception 'La cuota ya está pagada'; end if;

  -- descuenta de la cuenta (valida saldo)
  if p_account_id is not null then
    if not exists (
      select 1 from public.accounts where id = p_account_id and user_id = v_uid
    ) then raise exception 'Cuenta no encontrada'; end if;
    select balance into v_balance from public.accounts where id = p_account_id;
    if v_balance < v_inst.amount then
      raise exception 'Saldo insuficiente en la cuenta';
    end if;
    update public.accounts set balance = balance - v_inst.amount
      where id = p_account_id;
  end if;

  -- crea la transacción de pago
  insert into public.transactions (
    user_id, date, amount, kind, account_id,
    credit_card_id, debt_id, debt_installment_id, note
  ) values (
    v_uid, coalesce(p_date, current_date), v_inst.amount, 'debt_payment',
    p_account_id, v_inst.credit_card_id, v_inst.debt_id, v_inst.id,
    'Pago de cuota'
  )
  returning id into v_tx_id;

  -- marca la cuota pagada
  update public.debt_installments
    set status = 'paid', paid_at = now(), paid_transaction_id = v_tx_id
    where id = v_inst.id;

  -- efecto sobre la deuda o la tarjeta de origen
  if v_inst.debt_id is not null then
    select remaining_balance, remaining_installments
      into v_remaining, v_remaining_inst
      from public.debts where id = v_inst.debt_id;
    update public.debts set
      remaining_balance = greatest(0, v_remaining - v_inst.amount),
      remaining_installments = case
        when coalesce(v_remaining_inst, 0) > 0 then v_remaining_inst - 1 else 0 end
      where id = v_inst.debt_id;
  elsif v_inst.credit_card_id is not null then
    update public.credit_cards
      set current_debt = greatest(0, current_debt - v_inst.amount)
      where id = v_inst.credit_card_id;
  end if;

  return v_tx_id;
end;
$$;

revoke all on function public.pay_installment(uuid, uuid, date) from public;
grant execute on function public.pay_installment(uuid, uuid, date) to authenticated;

-- ---------- mark_overdue_installments ----------
-- Marca como 'overdue' las cuotas pendientes del usuario cuya fecha ya pasó.
create or replace function public.mark_overdue_installments()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.debt_installments
    set status = 'overdue'
    where user_id = v_uid
      and status = 'pending'
      and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_overdue_installments() from public;
grant execute on function public.mark_overdue_installments() to authenticated;
