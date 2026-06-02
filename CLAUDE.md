# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

React 19 + Vite 8 + TypeScript (strict) + Tailwind v3 + shadcn-style Radix primitives + TanStack Query v5 + React Hook Form + Zod + Recharts + date-fns. Backend: Supabase (Auth + Postgres + RLS) managed via the **Supabase CLI installed as a dev dependency** (no Docker, cloud-only flow). Installable PWA via `vite-plugin-pwa`. Locale fixed to Colombia (`es-CO`, COP).

## Common commands

```bash
npm run dev                              # vite dev server at localhost:5173
npm run build                            # tsc -b && vite build (also emits SW + manifest)
npm run preview                          # serve the production build
npm run test                             # vitest run (one-shot)
npm run test:watch                       # vitest --watch
npx vitest run path/to/file.test.ts      # run a single test file
npx vitest run -t "biweekly"             # run tests whose name matches a pattern
npm run lint                             # eslint .
npm run icons                            # regenerate PWA icons in public/icons/ (uses sharp)
```

Supabase CLI is project-local. Always use `npx supabase ...` or the `sb:*` npm scripts (never assume a global install):

```bash
npx supabase login                              # one-time, opens browser
npm run sb:link -- --project-ref <REF>          # link this repo to a cloud project
npm run sb:push                                 # apply pending migrations to the linked cloud DB
npm run sb:new-migration -- short_name          # creates supabase/migrations/<timestamp>_short_name.sql
npm run sb:gen-types                            # overwrites src/types/database.ts from real schema
npx supabase config push                        # sync supabase/config.toml (Auth, redirects) to cloud
npm run sb:reset                                # DESTRUCTIVE: wipes remote DB and reapplies everything
```

If a typecheck fails with a confusing `Cannot read file '.../supabase/migrations/tsconfig.json'` error, delete `node_modules/.tmp` (stale tsbuildinfo) and rerun. The tsconfig itself is fine.

## Architecture

### Feature-sliced layout under `src/`

Each domain lives under `features/<name>/` and exports a `<Name>Page.tsx`, a `<Name>Form.tsx`, and a colocated `hooks.ts` that wraps Supabase calls in TanStack Query hooks. The router (`src/app/router.tsx`) and the sidebar/bottom-nav (`src/components/layout/AppShell.tsx`) are the two places where adding a new feature requires touching shared code.

Domains: `auth`, `onboarding`, `dashboard`, `accounts`, `credit-cards`, `debts`, `income`, `transactions`, `projections`, `simulator`, `settings`.

### Pure financial logic is isolated

All business rules live in `src/lib/financial-calculations.ts` as **pure functions** (no Supabase imports, no React). They are the only thing covered by Vitest. Tests are in `src/lib/__tests__/financial-calculations.test.ts`. When adding a new calculation, add it here and add a happy-path test — UI code should never duplicate this math.

Notably: `projectFutureBalance` is the engine behind the dashboard projection chart, the projections page, and the simulator's "what happens next month" view. It takes recurring templates, debt installments, salary periods and one-off events, then produces a sorted timeline of `ProjectedEvent`s with a running balance.

### Data flow

```
UI (RHF + Zod schema) → useXMutation (TanStack)
                      → supabase.from(table).insert/update/delete
                      → RLS enforces auth.uid() = user_id server-side
                      → onSuccess invalidates queryKey
                      → re-render with fresh data
```

- One Supabase client: `src/lib/supabase.ts`.
- All Zod schemas live in `src/lib/validations.ts` (one per entity, reused by the form and as the insert/update shape).
- Query keys are namespaced by `user.id` via the factory in `src/lib/query-keys.ts`. This makes logout-invalidation trivial.
- The auth context (`src/features/auth/AuthProvider.tsx`) subscribes to `supabase.auth.onAuthStateChange` and exposes `user`, `loading`, `signOut` via `useAuth()`.

### Route protection has two layers

`<RequireAuth>` (redirects to `/login` if no session) wraps `<RequireOnboarding>` (redirects to `/onboarding` until `profiles.onboarding_completed = true`), which wraps the `<AppShell>` containing all real pages. The onboarding wizard sits inside `<RequireAuth>` but **outside** `<RequireOnboarding>` so it can render.

### Transactions have side effects

`src/features/transactions/hooks.ts` contains `applyBalanceEffect()`. When a transaction is created, it mutates the related account/card/debt balance directly (best-effort, not atomic via RPC). After any mutation, `invalidateAfterTx()` invalidates accounts/cards/debts/installments/recurring in one shot. Keep these two helpers in sync when adding new transaction kinds.

### Recurring transactions are NOT materialized by a cron

There is no Edge Function or scheduler. The pattern is:
1. Templates live in `recurring_transactions` with a `next_occurrence_date`.
2. `src/lib/recurrence.ts → expandRecurring(template, from, to)` produces **virtual** occurrences on the fly for the dashboard / projections / "upcoming payments".
3. When the user confirms an occurrence, `useMaterializeRecurring()` writes a real `transactions` row (with `recurrence_id` linking back) and advances `next_occurrence_date`.

This is intentional — don't add a cron for v1.

## Supabase

`supabase/config.toml` is the source of truth for Auth and project settings (no manual dashboard edits). Email/password is enabled, confirmations are off (dev), `site_url` is `http://localhost:5173`. After editing, run `npx supabase config push`.

Migrations in `supabase/migrations/` follow `<timestamp>_<name>.sql` (required by the CLI) and are **immutable once pushed** — create a new migration to change schema, never edit a previous one. Always create them via `npm run sb:new-migration -- <name>`.

RLS pattern: every table uses `auth.uid() = user_id` (except `profiles` which uses `auth.uid() = id` since it's 1:1 with `auth.users`). The trigger `handle_new_user` (in `0003_triggers.sql`) creates `profiles` + `settings` + 14 system categories at signup. Don't break this — the UI assumes those rows exist after the first login.

`src/types/database.ts` is hand-written today so the project compiles without running the CLI. After any schema change, regenerate it with `npm run sb:gen-types`.

## UI conventions

- shadcn-style components in `src/components/ui/` are copied (not from a package). Edit them freely.
- Money is always rendered via `<MoneyDisplay value={...}>` and entered via `<MoneyInput>` (handles COP parsing). `tnum` utility class enables tabular numbers — use it for any column of numbers.
- Date formatting goes through `src/lib/date-utils.ts` helpers (`formatDateShort`, etc.) — don't call `date-fns` directly from components.
- Forms: RHF + Zod resolver, wrapped in `<FormField label error>` for consistent labels/errors.
- iOS PWA safe areas: `safe-pt` / `safe-pb` utility classes are defined in `src/index.css`. Use them in fixed headers/bottom nav.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with auto-update SW, NetworkFirst caching for `*.supabase.co`, and CacheFirst for static assets. Icons are generated by `scripts/generate-icons.mjs` from an inline SVG and written to `public/icons/`. iOS-specific meta tags live in `index.html` (`apple-mobile-web-app-capable`, `apple-touch-icon`, `viewport-fit=cover`).

## What v1 intentionally does NOT have

No Plaid/Belvo imports, no push notifications, no multi-currency, no Edge Functions, no offline data sync, no PDF export, no shared/joint accounts. Treat requests that need these as scope-expansion, not as bugs.
