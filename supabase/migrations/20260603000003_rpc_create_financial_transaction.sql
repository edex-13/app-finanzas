-- =============================================================
-- 20260603000003_rpc_create_financial_transaction.sql
-- RPC atómica que inserta una transacción y aplica su efecto sobre
-- saldos de cuenta / deuda de tarjeta / saldo de deuda, en una sola
-- transacción SQL. Reemplaza el applyBalanceEffect best-effort del cliente.
--
-- Tipos soportados: income, expense, debt_payment, card_payment,
--                   transfer, adjustment.
-- Reglas:
--   income     -> + saldo cuenta
--   expense    -> con cuenta: - saldo (valida saldo); con tarjeta: + deuda tarjeta
--   debt_payment   -> - saldo cuenta (valida); - remaining_balance deuda;
--                     -1 remaining_installments; si trae cuota -> paid + paid_at
--   card_payment   -> - saldo cuenta (valida); - deuda tarjeta (NO sobrepago)
--   transfer       -> - cuenta origen (valida) + cuenta destino; patrimonio intacto
--   adjustment     -> fija el saldo de la cuenta al monto dado (corrección manual);
--                     requiere nota (se valida en el cliente)
--
-- SECURITY DEFINER + chequeo explícito de auth.uid() y de pertenencia de
-- cada entidad al usuario, porque definer salta RLS.
-- =============================================================

create or replace function public.create_financial_transaction(
  p_kind                 transaction_kind,
  p_amount               numeric,
  p_date                 date    default current_date,
  p_category_id          uuid    default null,
  p_account_id           uuid    default null,
  p_counterparty_account_id uuid default null,
  p_credit_card_id       uuid    default null,
  p_debt_id              uuid    default null,
  p_debt_installment_id  uuid    default null,
  p_note                 text    default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx_id uuid;
  v_balance numeric;
  v_debt numeric;
  v_remaining numeric;
  v_remaining_inst integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor que 0';
  end if;

  -- ---------- validaciones de pertenencia ----------
  if p_account_id is not null and not exists (
    select 1 from public.accounts where id = p_account_id and user_id = v_uid
  ) then raise exception 'Cuenta no encontrada'; end if;

  if p_counterparty_account_id is not null and not exists (
    select 1 from public.accounts where id = p_counterparty_account_id and user_id = v_uid
  ) then raise exception 'Cuenta destino no encontrada'; end if;

  if p_credit_card_id is not null and not exists (
    select 1 from public.credit_cards where id = p_credit_card_id and user_id = v_uid
  ) then raise exception 'Tarjeta no encontrada'; end if;

  if p_debt_id is not null and not exists (
    select 1 from public.debts where id = p_debt_id and user_id = v_uid
  ) then raise exception 'Deuda no encontrada'; end if;

  -- ---------- insertar la transacción ----------
  insert into public.transactions (
    user_id, date, amount, kind, category_id, account_id,
    counterparty_account_id, credit_card_id, debt_id, debt_installment_id, note
  ) values (
    v_uid, coalesce(p_date, current_date), p_amount, p_kind, p_category_id, p_account_id,
    p_counterparty_account_id, p_credit_card_id, p_debt_id, p_debt_installment_id, p_note
  )
  returning id into v_tx_id;

  -- ---------- efectos por tipo ----------
  if p_kind = 'income' then
    if p_account_id is null then raise exception 'Un ingreso requiere cuenta'; end if;
    update public.accounts set balance = balance + p_amount where id = p_account_id;

  elsif p_kind = 'expense' then
    if p_credit_card_id is not null then
      -- gasto con tarjeta: sube la deuda de la tarjeta (respeta el cupo)
      select credit_limit - current_debt into v_balance
        from public.credit_cards where id = p_credit_card_id;
      if v_balance < p_amount then
        raise exception 'El gasto supera el cupo disponible de la tarjeta';
      end if;
      update public.credit_cards set current_debt = current_debt + p_amount
        where id = p_credit_card_id;
    elsif p_account_id is not null then
      select balance into v_balance from public.accounts where id = p_account_id;
      if v_balance < p_amount then
        raise exception 'Saldo insuficiente en la cuenta';
      end if;
      update public.accounts set balance = balance - p_amount where id = p_account_id;
    else
      raise exception 'Un gasto requiere cuenta o tarjeta';
    end if;

  elsif p_kind = 'debt_payment' then
    if p_debt_id is null then raise exception 'Un pago de deuda requiere deuda'; end if;
    if p_account_id is not null then
      select balance into v_balance from public.accounts where id = p_account_id;
      if v_balance < p_amount then raise exception 'Saldo insuficiente en la cuenta'; end if;
      update public.accounts set balance = balance - p_amount where id = p_account_id;
    end if;
    select remaining_balance, remaining_installments
      into v_remaining, v_remaining_inst
      from public.debts where id = p_debt_id;
    update public.debts set
      remaining_balance = greatest(0, v_remaining - p_amount),
      remaining_installments = case
        when coalesce(v_remaining_inst, 0) > 0 then v_remaining_inst - 1 else 0 end
      where id = p_debt_id;
    if p_debt_installment_id is not null then
      update public.debt_installments
        set status = 'paid', paid_at = now(), paid_transaction_id = v_tx_id
        where id = p_debt_installment_id and user_id = v_uid;
    end if;

  elsif p_kind = 'card_payment' then
    if p_credit_card_id is null then raise exception 'Un pago de tarjeta requiere tarjeta'; end if;
    select current_debt into v_debt from public.credit_cards where id = p_credit_card_id;
    if p_amount > v_debt then
      raise exception 'No puedes pagar más que la deuda actual de la tarjeta';
    end if;
    if p_account_id is not null then
      select balance into v_balance from public.accounts where id = p_account_id;
      if v_balance < p_amount then raise exception 'Saldo insuficiente en la cuenta'; end if;
      update public.accounts set balance = balance - p_amount where id = p_account_id;
    end if;
    update public.credit_cards set current_debt = v_debt - p_amount
      where id = p_credit_card_id;

  elsif p_kind = 'transfer' then
    if p_account_id is null or p_counterparty_account_id is null then
      raise exception 'Una transferencia requiere cuenta origen y destino';
    end if;
    if p_account_id = p_counterparty_account_id then
      raise exception 'La cuenta origen y destino deben ser distintas';
    end if;
    select balance into v_balance from public.accounts where id = p_account_id;
    if v_balance < p_amount then raise exception 'Saldo insuficiente en la cuenta origen'; end if;
    update public.accounts set balance = balance - p_amount where id = p_account_id;
    update public.accounts set balance = balance + p_amount where id = p_counterparty_account_id;

  elsif p_kind = 'adjustment' then
    -- corrección manual: fija el saldo de la cuenta al valor indicado
    if p_account_id is null then raise exception 'Un ajuste requiere cuenta'; end if;
    if p_note is null or length(trim(p_note)) = 0 then
      raise exception 'Un ajuste requiere descripción';
    end if;
    update public.accounts set balance = p_amount where id = p_account_id;

  else
    raise exception 'Tipo de transacción no soportado: %', p_kind;
  end if;

  return v_tx_id;
end;
$$;

revoke all on function public.create_financial_transaction(
  transaction_kind, numeric, date, uuid, uuid, uuid, uuid, uuid, uuid, text
) from public;
grant execute on function public.create_financial_transaction(
  transaction_kind, numeric, date, uuid, uuid, uuid, uuid, uuid, uuid, text
) to authenticated;
