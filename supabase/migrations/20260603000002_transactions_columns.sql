-- =============================================================
-- 20260603000002_transactions_columns.sql
-- Columnas nuevas para Transacciones / Cuotas:
--   1. transactions.counterparty_account_id -> cuenta destino de una transferencia.
--   2. debt_installments.paid_at            -> momento real del pago de la cuota.
--   3. Cuotas de tarjeta: debt_id nullable + credit_card_id, reutilizando
--      debt_installments como calendario de cuotas (deuda O tarjeta).
-- (El valor de enum 'adjustment' vive en la migración previa, no aquí.)
-- =============================================================

-- ---------- 1. cuenta destino de transferencia ----------
alter table public.transactions
  add column if not exists counterparty_account_id uuid
    references public.accounts(id) on delete set null;

-- ---------- 2. paid_at en cuotas ----------
alter table public.debt_installments
  add column if not exists paid_at timestamptz;

-- ---------- 3. cuotas de tarjeta sobre la misma tabla ----------
alter table public.debt_installments
  alter column debt_id drop not null;

alter table public.debt_installments
  add column if not exists credit_card_id uuid
    references public.credit_cards(id) on delete cascade;

-- exactamente uno de los dos orígenes (deuda XOR tarjeta)
do $$ begin
  alter table public.debt_installments
    add constraint debt_installments_one_origin_chk
    check ((debt_id is not null) <> (credit_card_id is not null));
exception when duplicate_object then null; end $$;

create index if not exists debt_installments_card_idx
  on public.debt_installments (credit_card_id);
