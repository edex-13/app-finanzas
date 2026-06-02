# Finanzas Personales

PWA instalable para gestionar tu dinero, deudas, tarjetas e ingresos, y proyectar tu flujo financiero. Construida con **React + Vite + TypeScript + Tailwind + shadcn/ui** sobre **Supabase** (Auth + Postgres con RLS).

Pensada para Colombia: COP por defecto, cálculos de prima legal e intereses de cesantías. Locale fijo `es-CO`.

---

## Tabla de contenido

1. [Stack](#stack)
2. [Requisitos previos](#requisitos-previos)
3. [Puesta en marcha — paso a paso](#puesta-en-marcha--paso-a-paso)
   - [1. Clonar e instalar](#1-clonar-e-instalar)
   - [2. Crear el proyecto en Supabase](#2-crear-el-proyecto-en-supabase)
   - [3. Variables de entorno (`.env`)](#3-variables-de-entorno-env)
   - [4. Autenticar y enlazar la Supabase CLI](#4-autenticar-y-enlazar-la-supabase-cli)
   - [5. Aplicar el esquema (migraciones)](#5-aplicar-el-esquema-migraciones)
   - [6. Sincronizar la configuración de Auth](#6-sincronizar-la-configuración-de-auth)
   - [7. (Opcional) Regenerar tipos TypeScript](#7-opcional-regenerar-tipos-typescript)
   - [8. Correr la app](#8-correr-la-app)
   - [9. Probar el flujo completo](#9-probar-el-flujo-completo)
4. [Modelo de datos](#modelo-de-datos)
5. [Comandos disponibles](#comandos-disponibles)
6. [Cómo cambiar el esquema más adelante](#cómo-cambiar-el-esquema-más-adelante)
7. [Despliegue](#despliegue)
8. [Solución de problemas](#solución-de-problemas)
9. [Estado del proyecto](#estado-del-proyecto)

---

## Stack

| Capa | Tecnología |
|---|---|
| UI | React 19 + Vite 8 + TypeScript (strict) |
| Estilos | Tailwind CSS v3 + componentes shadcn-style (Radix) |
| Animación / gestos | framer-motion + vaul (bottom sheets) |
| Estado servidor | TanStack Query v5 |
| Formularios | React Hook Form + Zod |
| Gráficos | Recharts |
| Fechas | date-fns |
| Backend | Supabase (Auth + Postgres + RLS) |
| Routing | React Router v7 |
| PWA | vite-plugin-pwa (Workbox) |

---

## Requisitos previos

- **Node.js 20+** y **npm**.
- Una cuenta en **[Supabase](https://supabase.com)** (gratis).
- Un navegador (para `supabase login`, que abre una pestaña).

> No necesitas Docker ni instalar la Supabase CLI globalmente: la CLI viene como **dependencia del proyecto** y se usa con `npx supabase ...` o los scripts `sb:*`. Todo el flujo es **cloud-only**.

---

## Puesta en marcha — paso a paso

### 1. Clonar e instalar

```bash
git clone <URL-del-repo> app-finanzas-personales
cd app-finanzas-personales
npm install
```

`npm install` también instala la Supabase CLI local (en `devDependencies`).

---

### 2. Crear el proyecto en Supabase

1. Entra a <https://supabase.com/dashboard> y crea un **New project**.
2. Elige nombre, una **contraseña de base de datos** (guárdala) y la **región** más cercana.
3. Espera a que el proyecto termine de aprovisionarse (~1–2 min).
4. Anota dos datos que usarás en el `.env`:
   - **Project URL** y **anon public key**: en *Project Settings → API*.
   - **Project Reference (REF)**: el identificador en *Project Settings → General* (o el subdominio de la URL: `https://<REF>.supabase.co`).

---

### 3. Variables de entorno (`.env`)

Copia el ejemplo y rellénalo con los datos del paso anterior:

```bash
cp .env.example .env
```

`.env`:

```bash
# Supabase
VITE_SUPABASE_URL=https://TU-REF.supabase.co
VITE_SUPABASE_ANON_KEY=TU-ANON-KEY

# App (opcionales, ya tienen defaults)
VITE_APP_NAME=Finanzas
VITE_DEFAULT_CURRENCY=COP
VITE_DEFAULT_LOCALE=es-CO
```

> ⚠️ Usa **siempre** la *anon key* (pública), **nunca** la *service_role key* en el frontend. La seguridad la garantiza RLS en la base de datos.

---

### 4. Autenticar y enlazar la Supabase CLI

```bash
# 1) Inicia sesión (abre el navegador una sola vez)
npx supabase login

# 2) Enlaza este repo con tu proyecto cloud (usa el REF del paso 2)
npm run sb:link -- --project-ref TU-REF
```

La CLI puede pedirte la **contraseña de la base de datos** que definiste al crear el proyecto.

---

### 5. Aplicar el esquema (migraciones)

El esquema vive en `supabase/migrations/` (3 archivos, en orden):

| Migración | Qué hace |
|---|---|
| `…000001_initial_schema.sql` | Crea todas las tablas, enums e índices |
| `…000002_rls_policies.sql` | Activa RLS y crea políticas `auth.uid() = user_id` por tabla |
| `…000003_triggers.sql` | `updated_at` automático + `handle_new_user` (crea profile, settings y 14 categorías al registrarse) |

Aplícalas a tu base cloud:

```bash
npm run sb:push
```

Verifica en el dashboard (*Table editor*) que aparezcan las tablas: `profiles`, `settings`, `accounts`, `credit_cards`, `debts`, `debt_installments`, `income_sources`, `salary_periods`, `categories`, `recurring_transactions`, `transactions`, `projected_transactions`, `purchase_simulations`.

---

### 6. Sincronizar la configuración de Auth

`supabase/config.toml` es la **fuente de verdad** de la configuración de Auth (no edites el dashboard a mano). Por defecto trae:

- Email/contraseña **habilitado**.
- Confirmación de email **desactivada** (cómodo para desarrollo).
- `site_url = http://localhost:5173`.

Aplica esta configuración al proyecto cloud:

```bash
npx supabase config push
```

> Para **producción** edita `site_url` y `additional_redirect_urls` en `config.toml` (apuntando a tu dominio), y vuelve a correr `npx supabase config push`. Para exigir confirmación de email, pon `enable_confirmations = true` en `[auth.email]`.

---

### 7. (Opcional) Regenerar tipos TypeScript

`src/types/database.ts` está escrito a mano para que el proyecto compile **sin** correr la CLI. Si cambiaste el esquema, regéralo desde el esquema real:

```bash
npm run sb:gen-types
```

---

### 8. Correr la app

```bash
npm run dev
```

Abre <http://localhost:5173>.

---

### 9. Probar el flujo completo

1. **Regístrate** en `/register` (con confirmaciones off, entras de inmediato). El trigger `handle_new_user` crea tu `profile`, `settings` y 14 categorías automáticamente.
2. Serás redirigido al **onboarding** (`onboarding_completed = false`). Agrega al menos una cuenta, y opcionalmente tarjetas, deudas e ingresos.
3. Al finalizar, `onboarding_completed` pasa a `true` y entras al **dashboard**.
4. Comprueba que el dashboard muestre disponible, deuda total, patrimonio líquido, próximo pago, gasto seguro, próximos eventos y la proyección.
5. Cierra sesión y vuelve a entrar: la sesión persiste y vas directo al dashboard.

---

## Modelo de datos

```
auth.users (Supabase Auth)
  └─ trigger handle_new_user ⇒ crea profiles + settings + 14 categorías
profiles (1:1, key = id, onboarding_completed)   settings (alert_days_before_payment, theme…)
accounts        credit_cards        debts ─< debt_installments
income_sources ─< salary_periods    categories (14 del sistema + propias)
recurring_transactions   transactions   projected_transactions   purchase_simulations
```

- **RLS** en todas las tablas: `auth.uid() = user_id` (excepto `profiles`, que usa `auth.uid() = id`).
- La mayoría de tablas tienen `archived` (soft delete) y `updated_at` mantenido por trigger.
- Las **transacciones recurrentes no se materializan por cron**: se expanden virtualmente (`src/lib/recurrence.ts`) y solo se crean filas reales al confirmarlas.

---

## Comandos disponibles

```bash
# App
npm run dev          # servidor de desarrollo (localhost:5173)
npm run build        # tsc -b && vite build (genera SW + manifest)
npm run preview      # sirve el build de producción
npm run lint         # eslint
npm run test         # vitest run (una vez)
npm run test:watch   # vitest en watch
npm run icons        # regenera iconos PWA en public/icons/

# Supabase (CLI local — siempre vía npx o scripts sb:*)
npx supabase login                           # login (una vez)
npm run sb:link -- --project-ref <REF>       # enlazar repo ↔ proyecto cloud
npm run sb:push                              # aplicar migraciones pendientes
npm run sb:new-migration -- <nombre>         # crear nueva migración
npm run sb:gen-types                         # regenerar src/types/database.ts
npm run sb:pull                              # traer cambios del esquema remoto
npm run sb:diff                              # ver diferencias de esquema
npx supabase config push                     # sincronizar config.toml (Auth) a cloud
npm run sb:reset                             # ⚠️ DESTRUCTIVO: borra la BD remota y reaplica todo
```

---

## Cómo cambiar el esquema más adelante

Las migraciones son **inmutables una vez aplicadas**: nunca edites una migración ya empujada; crea una nueva.

```bash
npm run sb:new-migration -- agregar_campo_x   # crea supabase/migrations/<timestamp>_agregar_campo_x.sql
# edita el SQL generado…
npm run sb:push                               # aplica a cloud
npm run sb:gen-types                           # actualiza los tipos TS
```

No rompas el trigger `handle_new_user`: la UI asume que `profiles`, `settings` y las categorías del sistema existen tras el primer login.

---

## Despliegue

1. Configura las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en tu host (Vercel, Netlify, Cloudflare Pages, etc.).
2. En `supabase/config.toml`, ajusta `site_url` y `additional_redirect_urls` a tu dominio de producción y corre `npx supabase config push`.
3. Build: `npm run build`. Sirve la carpeta `dist/` (es una SPA — configura fallback a `index.html`).
4. La PWA se sirve sola: el service worker y el manifest se generan en el build.

---

## Solución de problemas

- **`Cannot read file '.../supabase/migrations/tsconfig.json'`** al compilar → borra el caché obsoleto y reintenta:
  ```bash
  rm -rf node_modules/.tmp && npm run build
  ```
- **`Missing VITE_SUPABASE_URL / ANON_KEY`** → falta el `.env` o no reiniciaste `npm run dev` tras crearlo.
- **`sb:push` pide contraseña** → es la contraseña de la base de datos que definiste al crear el proyecto en Supabase.
- **El registro funciona pero el dashboard aparece vacío / falla** → revisa que `sb:push` haya aplicado las 3 migraciones (el trigger `handle_new_user` debe existir).
- **Redirige siempre al onboarding** → `profiles.onboarding_completed` sigue en `false`; complétalo o ponlo en `true` en el *Table editor*.
- **El login redirige mal en producción** → `site_url`/`additional_redirect_urls` en `config.toml` no apuntan a tu dominio; corrígelos y `npx supabase config push`.

---

## Estado del proyecto

Resumen del alcance real (qué está completo, a medias o sin empezar) en **[`promt/SUMMARY.md`](promt/SUMMARY.md)**.

- **Completo:** Auth + onboarding, dashboard, CRUD de cuentas/tarjetas/deudas, PWA base.
- **A medias:** transacciones (faltan ajuste, transferencia real, edición, atomicidad por RPC), cuotas, simulador.
- **Sin empezar:** importación CSV (fuera de alcance de v1).

Convenciones internas para contribuir: ver [`CLAUDE.md`](CLAUDE.md).
