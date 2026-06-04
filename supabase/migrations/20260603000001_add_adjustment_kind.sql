-- =============================================================
-- 20260603000001_add_adjustment_kind.sql
-- Añade el valor 'adjustment' a los enums de tipo de movimiento.
-- Va en su PROPIA migración porque ALTER TYPE ... ADD VALUE no puede
-- usarse en la misma transacción donde después se referencia el valor
-- (lo necesita la RPC create_financial_transaction de la migración siguiente).
-- =============================================================

alter type transaction_kind add value if not exists 'adjustment';
alter type category_kind   add value if not exists 'adjustment';
