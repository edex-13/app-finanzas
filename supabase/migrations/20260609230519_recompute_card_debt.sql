-- =============================================================
-- recompute_card_debt.sql
-- 1. recompute_card_debt(card): recalcula current_debt de una tarjeta como
--    opening_balance + Σ gastos(expense con tarjeta) − Σ pagos(card_payment).
--    Idempotente: cuadra el saldo a partir de los movimientos reales.
-- 2. Reescribe create_financial_transaction y pay_installment para que, en vez
--    de sumar/restar current_debt a mano, llamen a recompute_card_debt. Así el
--    saldo nunca deriva y soportamos pagar cuotas de crédito CON la tarjeta.
-- =============================================================

-- ---------- recompute_card_debt ----------
create or replace function public.recompute_card_debt(p_card_id uuid)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_opening numeric;
  v_charges numeric;
  v_payments numeric;
  v_debt numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_card_id is null then return null; end if;

  select opening_balance into v_opening
    from public.credit_cards where id = p_card_id and user_id = v_uid;
  if not found then raise exception 'Tarjeta no encontrada'; end if;

  -- Σ cargos a la tarjeta (gastos / compras a cuotas registradas como expense)
  select coalesce(sum(amount), 0) into v_charges
    from public.transactions
    where user_id = v_uid and credit_card_id = p_card_id and kind = 'expense';

  -- Σ pagos a la tarjeta (abonos directos + pagos de cuotas que cargan-y-abonan)
  select coalesce(sum(amount), 0) into v_payments
    from public.transactions
    where user_id = v_uid and credit_card_id = p_card_id and kind = 'card_payment';

  v_debt := greatest(0, coalesce(v_opening, 0) + v_charges - v_payments);

  update public.credit_cards set current_debt = v_debt where id = p_card_id;
  return v_debt;
end;
$$;

revoke all on function public.recompute_card_debt(uuid) from public;
grant execute on function public.recompute_card_debt(uuid) to authenticated;

-- =============================================================
-- create_financial_transaction (reescrita): los efectos sobre tarjeta ya no
-- mutan current_debt directamente; insertan el movimiento y recomputan.
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
      -- gasto con tarjeta: respeta el cupo, luego recomputa el saldo derivado
      select credit_limit - current_debt into v_balance
        from public.credit_cards where id = p_credit_card_id;
      if v_balance < p_amount then
        raise exception 'El gasto supera el cupo disponible de la tarjeta';
      end if;
      perform public.recompute_card_debt(p_credit_card_id);
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
    perform public.recompute_card_debt(p_credit_card_id);

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

-- =============================================================
-- pay_installment (reescrita) con nuevo parámetro p_pay_with_card_id.
--
--   - Cuota de DEUDA pagada CON tarjeta (p_pay_with_card_id no nulo):
--       inserta un expense en esa tarjeta (carga la tarjeta) + recomputa,
--       y baja remaining_balance / remaining_installments del crédito.
--       NO descuenta de cuenta.
--   - Cuota de DEUDA pagada con cuenta (o sin medio): como antes.
--   - Cuota de TARJETA (compra a cuotas, credit_card_id en la cuota):
--       inserta un card_payment sobre esa tarjeta + recomputa (en vez de
--       restar current_debt a mano).
-- =============================================================
create or replace function public.pay_installment(
  p_installment_id   uuid,
  p_account_id       uuid default null,
  p_date             date default current_date,
  p_pay_with_card_id uuid default null
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
  v_avail numeric;
  v_remaining numeric;
  v_remaining_inst integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_inst
    from public.debt_installments
    where id = p_installment_id and user_id = v_uid;
  if not found then raise exception 'Cuota no encontrada'; end if;
  if v_inst.status = 'paid' then raise exception 'La cuota ya está pagada'; end if;

  if p_pay_with_card_id is not null and not exists (
    select 1 from public.credit_cards where id = p_pay_with_card_id and user_id = v_uid
  ) then raise exception 'Tarjeta no encontrada'; end if;

  -- ---------- cuota de una DEUDA ----------
  if v_inst.debt_id is not null then
    if p_pay_with_card_id is not null then
      -- Pagar la cuota CON la tarjeta: la cuota se carga a la tarjeta como gasto.
      select credit_limit - current_debt into v_avail
        from public.credit_cards where id = p_pay_with_card_id;
      if v_avail < v_inst.amount then
        raise exception 'La cuota supera el cupo disponible de la tarjeta';
      end if;
      -- registro de pago de la cuota, ligado a la tarjeta usada
      insert into public.transactions (
        user_id, date, amount, kind, account_id,
        credit_card_id, debt_id, debt_installment_id, note
      ) values (
        v_uid, coalesce(p_date, current_date), v_inst.amount, 'expense',
        null, p_pay_with_card_id, v_inst.debt_id, v_inst.id,
        'Pago de cuota con tarjeta'
      )
      returning id into v_tx_id;
      perform public.recompute_card_debt(p_pay_with_card_id);
    else
      -- descuenta de la cuenta (valida saldo) si se indica
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
      insert into public.transactions (
        user_id, date, amount, kind, account_id,
        credit_card_id, debt_id, debt_installment_id, note
      ) values (
        v_uid, coalesce(p_date, current_date), v_inst.amount, 'debt_payment',
        p_account_id, null, v_inst.debt_id, v_inst.id,
        'Pago de cuota'
      )
      returning id into v_tx_id;
    end if;

    -- efecto sobre la deuda (baja saldo y cuotas restantes)
    select remaining_balance, remaining_installments
      into v_remaining, v_remaining_inst
      from public.debts where id = v_inst.debt_id;
    update public.debts set
      remaining_balance = greatest(0, v_remaining - v_inst.amount),
      remaining_installments = case
        when coalesce(v_remaining_inst, 0) > 0 then v_remaining_inst - 1 else 0 end
      where id = v_inst.debt_id;

  -- ---------- cuota de una TARJETA (compra a cuotas) ----------
  elsif v_inst.credit_card_id is not null then
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
    insert into public.transactions (
      user_id, date, amount, kind, account_id,
      credit_card_id, debt_id, debt_installment_id, note
    ) values (
      v_uid, coalesce(p_date, current_date), v_inst.amount, 'card_payment',
      p_account_id, v_inst.credit_card_id, null, v_inst.id,
      'Pago de cuota de tarjeta'
    )
    returning id into v_tx_id;
    perform public.recompute_card_debt(v_inst.credit_card_id);
  end if;

  -- marca la cuota pagada
  update public.debt_installments
    set status = 'paid', paid_at = now(), paid_transaction_id = v_tx_id
    where id = v_inst.id;

  return v_tx_id;
end;
$$;

revoke all on function public.pay_installment(uuid, uuid, date, uuid) from public;
grant execute on function public.pay_installment(uuid, uuid, date, uuid) to authenticated;

-- La firma anterior de 3 args queda obsoleta; la eliminamos para que el cliente
-- use siempre la nueva (4 args). PostgREST resuelve por nombre de parámetros.
drop function if exists public.pay_installment(uuid, uuid, date);
