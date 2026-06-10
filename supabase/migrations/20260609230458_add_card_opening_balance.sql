-- =============================================================
-- add_card_opening_balance.sql
-- El saldo de una tarjeta (current_debt) pasa a ser DERIVADO:
--   current_debt = opening_balance + Σ cargos − Σ pagos.
-- opening_balance es el saldo de apertura que el usuario fija una sola vez
-- (lo que ya debía la tarjeta al registrarla). current_debt deja de editarse
-- a mano y se recalcula vía recompute_card_debt() (ver migración siguiente).
-- =============================================================

alter table public.credit_cards
  add column if not exists opening_balance numeric(14,2) not null default 0;

-- Backfill: el saldo que el usuario ya había escrito a mano se convierte en
-- el saldo de apertura (punto de partida), preservando su valor actual.
update public.credit_cards set opening_balance = current_debt;
