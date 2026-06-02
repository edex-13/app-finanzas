-- =============================================================
-- 0003_triggers.sql
-- - set_updated_at: mantiene updated_at en cada UPDATE
-- - handle_new_user: crea profile + settings + categorías sistema al signup
-- =============================================================

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'profiles','settings','accounts','credit_cards','debts','debt_installments',
    'income_sources','salary_periods','categories','recurring_transactions','transactions'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format($trig$
      create trigger trg_%1$s_updated_at
      before update on public.%1$I
      for each row execute function public.set_updated_at()
    $trig$, t);
  end loop;
end $$;

-- ---------- handle_new_user ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := new.id;
begin
  insert into public.profiles (id, full_name)
    values (v_user_id, coalesce(new.raw_user_meta_data->>'full_name', ''))
    on conflict (id) do nothing;

  insert into public.settings (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

  -- Categorías sistema por defecto (es-CO)
  insert into public.categories (user_id, name, kind, color, icon, is_system)
  values
    (v_user_id, 'Alimentación',     'expense', '#f97316', 'utensils',         true),
    (v_user_id, 'Transporte',       'expense', '#0ea5e9', 'car',              true),
    (v_user_id, 'Vivienda',         'expense', '#8b5cf6', 'home',             true),
    (v_user_id, 'Servicios',        'expense', '#22c55e', 'plug',             true),
    (v_user_id, 'Salud',            'expense', '#ef4444', 'heart-pulse',      true),
    (v_user_id, 'Entretenimiento',  'expense', '#ec4899', 'film',             true),
    (v_user_id, 'Educación',        'expense', '#14b8a6', 'graduation-cap',   true),
    (v_user_id, 'Compras',          'expense', '#a855f7', 'shopping-bag',     true),
    (v_user_id, 'Suscripciones',    'expense', '#64748b', 'repeat',           true),
    (v_user_id, 'Salario',          'income',  '#16a34a', 'briefcase',        true),
    (v_user_id, 'Otros ingresos',   'income',  '#10b981', 'wallet',           true),
    (v_user_id, 'Pago de deuda',    'debt_payment','#dc2626','credit-card',   true),
    (v_user_id, 'Pago de tarjeta',  'card_payment','#dc2626','credit-card',   true),
    (v_user_id, 'Transferencia',    'transfer','#3b82f6', 'arrow-left-right', true)
  on conflict (user_id, name, kind) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
