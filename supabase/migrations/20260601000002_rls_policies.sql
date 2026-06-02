-- =============================================================
-- 0002_rls_policies.sql
-- Habilita RLS y crea políticas CRUD por user_id en todas las tablas.
-- Idempotente: drop policy if exists antes de crear.
-- =============================================================

-- Tablas que protege RLS por user_id
do $$
declare
  t text;
  tables text[] := array[
    'profiles','settings','accounts','credit_cards','debts','debt_installments',
    'income_sources','salary_periods','categories','recurring_transactions',
    'transactions','projected_transactions','purchase_simulations'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: la columna pivote es "id" (= auth.users.id), no user_id
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Helper: genera las 4 políticas por user_id en todas las demás tablas
do $$
declare
  t text;
  tables text[] := array[
    'settings','accounts','credit_cards','debts','debt_installments',
    'income_sources','salary_periods','categories','recurring_transactions',
    'transactions','projected_transactions','purchase_simulations'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);

    execute format($p$
      create policy "%1$s_select_own" on public.%1$I
        for select using (auth.uid() = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_insert_own" on public.%1$I
        for insert with check (auth.uid() = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_update_own" on public.%1$I
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_delete_own" on public.%1$I
        for delete using (auth.uid() = user_id)
    $p$, t);
  end loop;
end $$;
