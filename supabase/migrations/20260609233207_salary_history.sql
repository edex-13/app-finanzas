-- =============================================================
-- salary_history.sql
-- Historial de sueldos por fuente de ingreso: "del 1 ene al 10 feb gané X,
-- después gané Y". Cada fila marca DESDE CUÁNDO rige un monto mensual; el
-- tramo termina donde empieza el siguiente (o sigue vigente si es el último).
-- Con esto las prestaciones (prima, cesantías, intereses) se calculan con el
-- salario real de cada tramo y no con un único monto estático.
-- income_sources.monthly_amount se mantiene sincronizado = sueldo vigente.
-- =============================================================

create table if not exists public.salary_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid not null references public.income_sources(id) on delete cascade,
  monthly_amount numeric(14,2) not null check (monthly_amount >= 0),
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (income_source_id, start_date)
);
create index if not exists salary_history_source_start_idx
  on public.salary_history (income_source_id, start_date);

-- RLS (mismo patrón user_id que el resto de tablas)
alter table public.salary_history enable row level security;

drop policy if exists "salary_history_select_own" on public.salary_history;
drop policy if exists "salary_history_insert_own" on public.salary_history;
drop policy if exists "salary_history_update_own" on public.salary_history;
drop policy if exists "salary_history_delete_own" on public.salary_history;

create policy "salary_history_select_own" on public.salary_history
  for select using (auth.uid() = user_id);
create policy "salary_history_insert_own" on public.salary_history
  for insert with check (auth.uid() = user_id);
create policy "salary_history_update_own" on public.salary_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "salary_history_delete_own" on public.salary_history
  for delete using (auth.uid() = user_id);

-- updated_at trigger (mismo helper global)
drop trigger if exists trg_salary_history_updated_at on public.salary_history;
create trigger trg_salary_history_updated_at
  before update on public.salary_history
  for each row execute function public.set_updated_at();

-- Backfill: cada fuente existente arranca su historial con el sueldo actual
-- desde su fecha de inicio.
insert into public.salary_history (user_id, income_source_id, monthly_amount, start_date)
select user_id, id, monthly_amount, start_date
from public.income_sources
on conflict (income_source_id, start_date) do nothing;
