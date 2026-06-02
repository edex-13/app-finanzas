-- =============================================================
-- 0001_initial_schema.sql
-- Tablas base de la app de finanzas personales (MVP v1)
-- Idempotente: usa IF NOT EXISTS / CREATE TYPE guard.
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type account_type as enum ('cash','bank','digital_wallet','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type debt_type as enum ('loan','mortgage','credit_card','personal','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_frequency as enum ('weekly','biweekly','monthly','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type installment_status as enum ('pending','paid','overdue','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type income_payment_type as enum ('monthly','biweekly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type salary_period_type as enum ('regular','prima','cesantias_interest','bonus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_kind as enum ('income','expense','debt_payment','card_payment','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_kind as enum ('income','expense','debt_payment','card_payment','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurrence_frequency as enum ('daily','weekly','biweekly','monthly','yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type purchase_payment_option as enum ('cash','account','card');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  currency text not null default 'COP',
  locale text not null default 'es-CO',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- SETTINGS ----------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'COP',
  locale text not null default 'es-CO',
  alert_days_before_payment integer not null default 3,
  theme text not null default 'system',
  dashboard_widgets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- ACCOUNTS ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type account_type not null default 'bank',
  balance numeric(14,2) not null default 0,
  institution text,
  color text,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_user_archived_idx on public.accounts (user_id, archived);

-- ---------- CREDIT CARDS ----------
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  credit_limit numeric(14,2) not null default 0,
  current_debt numeric(14,2) not null default 0,
  statement_day smallint not null check (statement_day between 1 and 31),
  payment_due_day smallint not null check (payment_due_day between 1 and 31),
  color text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credit_cards_user_archived_idx on public.credit_cards (user_id, archived);

-- ---------- DEBTS ----------
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type debt_type not null default 'loan',
  total_amount numeric(14,2) not null default 0,
  remaining_balance numeric(14,2) not null default 0,
  interest_rate numeric(7,4) not null default 0,
  has_interest boolean not null default true,
  payment_frequency payment_frequency not null default 'monthly',
  next_payment_date date,
  total_installments integer,
  remaining_installments integer,
  approx_installment_amount numeric(14,2) not null default 0,
  payment_method_account_id uuid references public.accounts(id) on delete set null,
  payment_method_card_id uuid references public.credit_cards(id) on delete set null,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists debts_user_archived_idx on public.debts (user_id, archived);
create index if not exists debts_user_next_payment_idx on public.debts (user_id, next_payment_date);

-- ---------- DEBT INSTALLMENTS ----------
create table if not exists public.debt_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  sequence integer not null,
  due_date date not null,
  amount numeric(14,2) not null,
  status installment_status not null default 'pending',
  paid_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists debt_installments_user_due_idx on public.debt_installments (user_id, due_date);
create index if not exists debt_installments_debt_idx on public.debt_installments (debt_id);

-- ---------- INCOME SOURCES ----------
create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  monthly_amount numeric(14,2) not null default 0,
  start_date date not null default current_date,
  end_date date,
  payment_type income_payment_type not null default 'monthly',
  is_primary_salary boolean not null default false,
  includes_legal_benefits boolean not null default false,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists income_sources_user_archived_idx on public.income_sources (user_id, archived);

-- ---------- SALARY PERIODS ----------
create table if not exists public.salary_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid not null references public.income_sources(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  expected_amount numeric(14,2) not null,
  actual_amount numeric(14,2),
  type salary_period_type not null default 'regular',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists salary_periods_user_period_idx on public.salary_periods (user_id, period_end);

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind category_kind not null default 'expense',
  color text,
  icon text,
  is_system boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, kind)
);
create index if not exists categories_user_kind_idx on public.categories (user_id, kind);

-- ---------- RECURRING TRANSACTIONS ----------
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind transaction_kind not null,
  amount numeric(14,2) not null,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  frequency recurrence_frequency not null default 'monthly',
  interval_count integer not null default 1 check (interval_count > 0),
  start_date date not null default current_date,
  end_date date,
  next_occurrence_date date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_tx_user_next_idx on public.recurring_transactions (user_id, next_occurrence_date) where active;

-- ---------- TRANSACTIONS ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount numeric(14,2) not null,
  kind transaction_kind not null,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  debt_installment_id uuid references public.debt_installments(id) on delete set null,
  recurrence_id uuid references public.recurring_transactions(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_kind_idx on public.transactions (user_id, kind);

-- ---------- PROJECTED TRANSACTIONS (escape hatch para escenarios guardados) ----------
create table if not exists public.projected_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_name text not null default 'default',
  date date not null,
  amount numeric(14,2) not null,
  kind transaction_kind not null,
  source text,
  source_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists projected_tx_user_date_idx on public.projected_transactions (user_id, date);

-- ---------- PURCHASE SIMULATIONS ----------
create table if not exists public.purchase_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_amount numeric(14,2) not null,
  simulation_date date not null default current_date,
  payment_option purchase_payment_option not null,
  selected_account_id uuid references public.accounts(id) on delete set null,
  selected_card_id uuid references public.credit_cards(id) on delete set null,
  suggested_card_id uuid references public.credit_cards(id) on delete set null,
  can_afford boolean not null default false,
  impact_json jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists purchase_sim_user_created_idx on public.purchase_simulations (user_id, created_at desc);
