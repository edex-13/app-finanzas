-- =============================================================
-- 20260603000005_salary_cesantias_type.sql
-- Añade el valor 'cesantias' a salary_period_type: el CAPITAL de cesantías
-- (un salario al año) que NO se consigna a la cuenta del empleado (va a un
-- fondo). Antes solo existía 'cesantias_interest' (los intereses, que SÍ van
-- a la cuenta). Se modela como periodo informativo, excluido del saldo en la
-- proyección.
-- =============================================================

alter type salary_period_type add value if not exists 'cesantias';
