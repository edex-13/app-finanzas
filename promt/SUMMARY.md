# Resumen de los prompts (`promt/1.md` … `promt/10.md`)

Estado a **2026-06-01**. Leyenda: ✅ completo · 🟡 a medias · ❌ falta · ⚠️ nota/observación.

Los 10 prompts describen, en orden, la construcción incremental de la app. Hay **dos pares duplicados**: `promt/4.md` es idéntico a `promt/5.md` (transacciones), y el bloque de transacciones se repite. `promt/10.md` no es un prompt de features sino una **guía de estilo visual**.

---

## promt/1.md — Integración base con Supabase (Auth + Perfil + Onboarding)
**Estado global: ✅ completo**

| Punto | Estado | Evidencia |
|---|---|---|
| `src/lib/supabase.ts` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` | ✅ | `src/lib/supabase.ts`, `src/lib/env.ts` |
| Auth: login, registro, logout, sesión persistente | ✅ | `AuthProvider.tsx` (onAuthStateChange, persistSession), `LoginPage.tsx`, `RegisterPage.tsx` |
| Rutas privadas protegidas | ✅ | `RequireAuth.tsx` + `RequireOnboarding.tsx` en `router.tsx` |
| Onboarding financiero | ✅ | `OnboardingWizard.tsx` (pasos: welcome, accounts, cards, debts, income, done) |
| Onboarding guarda en accounts/credit_cards/debts/income_sources/salary_periods/profiles | ✅ | wizard escribe vía hooks de cada feature; `salary_periods` se generan al crear income |
| Marca `profiles.onboarding_completed = true` al terminar | ✅ | `useCompleteOnboarding()` |
| Redirección según `onboarding_completed` | ✅ | `RequireOnboarding.tsx` |
| RHF + Zod | ✅ | `src/lib/validations.ts` (todos los esquemas) |
| TanStack Query | ✅ | hooks de cada feature |

⚠️ El trigger `handle_new_user` crea `profiles` + `settings` + **14 categorías** del sistema al hacer signup (`0003_triggers.sql`).

---

## promt/2.md — Dashboard principal
**Estado global: ✅ completo (cerrado en esta sesión)**

| Punto | Estado | Evidencia |
|---|---|---|
| Pantalla Dashboard | ✅ | `DashboardPage.tsx` |
| Lee accounts, credit_cards, debts, income_sources, salary_periods, transactions, projected_transactions | 🟡 | Lee 5/7 tablas + recurring; `transactions`/`projected_transactions` no se leen directamente (la proyección se calcula en cliente) |
| Indicadores: disponible, deuda total, deuda tarjetas, deuda otras, patrimonio, próximos pagos, ingresos próximos, saldo a 30d | ✅ | KPIs + desglose tarjetas/otras + ingresos próximos |
| 5 cards: disponible, deuda total, patrimonio, próximo pago, capacidad de gasto seguro | ✅ | `DashboardPage.tsx` (KpiCard ×5) |
| Sección de eventos con Fecha, Tipo, Descripción, Valor, **Estado** | ✅ | `EventRow` con badge de estado (Vencido/Hoy/Pronto/Programado) |
| Gráfica de línea (Recharts) saldo proyectado | ✅ | `ProjectionLineChart.tsx` |
| Gráfica de deuda por origen | ✅ | `DebtsBarChart.tsx` |
| Estados vacíos específicos (cuentas/tarjetas/deudas/ingresos) | ✅ | EmptyState + `SetupHint` por tipo + mensaje "libre de deudas" |
| TanStack Query | ✅ | hooks |
| Protegido + redirección onboarding | ✅ | guards |
| Funciones puras EXACTAS: `calculateTotalAvailableMoney`, `calculateTotalCreditCardDebt`, `calculateTotalDebt`, `calculateNetWorth`, `calculateUpcomingPayments`, `calculateProjectedBalance`, `calculateSafeSpendingCapacity` | ✅ | `financial-calculations.ts` (las 7 con nombre exacto; `calculateNetWorth`/`calculateProjectedBalance` son alias) + tests |

---

## promt/3.md — CRUD de Cuentas, Tarjetas, Deudas
**Estado global: ✅ completo**

| Punto | Estado | Evidencia |
|---|---|---|
| Módulo cuentas (listar/crear/editar/eliminar) | ✅ | `accounts/` (Page, Form, hooks) |
| Saldo total de cuentas | ✅ | dashboard/snapshot |
| Módulo tarjetas con cupo disponible calculado | ✅ | `credit-cards/`; `calculateAvailableCardLimit` |
| Validación día corte/pago 1–31 | ✅ | `creditCardSchema` + CHECK en SQL |
| Indicador de alto uso de tarjeta | 🟡 | `decorateCard` calcula `utilization`; el rediseño lo muestra visualmente |
| `calculateCreditCardUtilization` (nombre exacto) | ⚠️ | Existe la lógica de utilización dentro de `decorateCard`, pero **no** una función con ese nombre exacto |
| Módulo deudas con todos los campos | ✅ | `debts/` |
| Generar cuotas futuras / progreso / cuotas restantes | 🟡 | `generateDebtInstallments` + progreso en UI; ver promt/6 para detalle |
| RHF + Zod + loading + error + confirmación de borrado | ✅ | forms + diálogos |
| Hooks `useAccounts`/`useCreate…`/`useUpdate…`/`useDelete…` (cuentas, tarjetas, deudas) | ✅ | hooks de cada feature |
| TanStack cache + invalidación | ✅ | hooks |
| Seguridad por usuario (RLS, sin registros sin user_id) | ✅ | `0002_rls_policies.sql` (`auth.uid() = user_id`) |

---

## promt/4.md == promt/5.md — Transacciones reales
**Estado global: 🟡 a medias** (núcleo funciona; faltan tipos/atomicidad/funciones nombradas)

| Punto | Estado | Evidencia |
|---|---|---|
| Pantalla con listado | ✅ | `TransactionsPage.tsx` |
| Filtros por fecha / tipo / categoría | ✅ | TransactionsPage |
| Filtros por cuenta / tarjeta | ❌ | `TransactionFilters` solo tiene from/to/kind/categoryId |
| Buscador por descripción | ❌ | no implementado |
| Tipos: ingreso, gasto, pago deuda, pago tarjeta, transferencia | ✅ | `TransactionForm.tsx` |
| Tipo **ajuste** | ❌ | no existe en el enum `transaction_kind` |
| Reglas ingreso/gasto/pago deuda | ✅ | `applyBalanceEffect()` |
| Regla pago tarjeta sin sobrepago | 🟡 | descuenta pero usa `Math.max(0,…)`; sin validación dura de sobrepago |
| Regla transferencia (mover entre cuentas, validar saldo) | ❌ | el form acepta el tipo pero `applyBalanceEffect` no maneja `transfer` |
| Gasto con tarjeta a cuotas (pide #cuotas/interés/tasa/fecha y crea cuotas) | ❌ | el form no pide datos de cuotas |
| Funciones puras EXACTAS: `applyIncomeTransaction`, `applyExpenseTransaction`, `applyDebtPaymentTransaction`, `applyCreditCardPaymentTransaction`, `applyTransferTransaction`, `applyAdjustmentTransaction`, `validateSufficientBalance`, `calculateTransactionImpact` | ❌ | toda la lógica está en un único `applyBalanceEffect()`; no existen con esos nombres |
| Hooks: `useTransactions`, `useCreateTransaction`, `useDeleteTransaction` | ✅ | `transactions/hooks.ts` |
| Hooks: `useUpdateTransaction`, `useTransactionFilters` | ❌ | no existen (no se pueden editar transacciones, solo borrar/recrear) |
| RPC `create_financial_transaction` (atómica) | ❌ | no hay RPC; las mutaciones multi-tabla son **best-effort** en cliente (comentado "sin RPC") |
| UI: badges por tipo, verde/rojo, confirmación de borrado | ✅ | TransactionsPage |

---

## promt/6.md — Automatización de cuotas / deudas / pagos futuros
**Estado global: 🟡 a medias**

| Punto | Estado | Evidencia |
|---|---|---|
| Tabla `debt_installments` | ✅ | `0001_initial_schema.sql` |
| Generar cuotas futuras de una deuda | ✅ | `generateDebtInstallments()` (se llama al crear deuda) |
| Frecuencias: semanal/quincenal/mensual/cada X/personalizada | 🟡 | `advanceByFrequency` soporta varias; "cada X días"/personalizada parcial |
| Al crear deuda: fechas, valor, registros, estado `pending` | ✅ | `useCreateDebt` |
| Al pagar cuota: marcar paid, paid_at, bajar saldo/cuotas, crear transacción, actualizar proyección | 🟡 | se marca `paid` y baja saldo dentro de `applyBalanceEffect`; **no** hay `paid_at` ni flujo dedicado |
| Estado `late`/vencida + alerta en dashboard/proyección | 🟡 | el dashboard marca "Vencido" por fecha; no se persiste estado `overdue` en BD |
| Compras con tarjeta a cuotas | ❌ | no implementado |
| Funciones: `generateInstallmentSchedule`, `calculateInstallmentAmount`, `markInstallmentAsPaid`, `detectLateInstallments`, `recalculateDebtProgress`, `generateCardInstallments` | ❌/🟡 | solo existe `generateDebtInstallments` (nombre distinto); el resto falta |
| RPC para pagar cuota atómica | ❌ | no hay |
| UI detalle de deuda: lista de cuotas, botón "marcar pagada", progreso, próxima/vencidas | 🟡 | hay progreso y resumen; **falta** lista de cuotas individuales y botón por cuota |

---

## promt/7.md — Simulador de compra
**Estado global: 🟡 a medias** (form + recomendación de tarjeta OK; faltan funciones nombradas, riesgo y convertir a transacción)

| Punto | Estado | Evidencia |
|---|---|---|
| Pantalla simulador + formulario (valor, fecha, categoría, necesaria, medio de pago) | 🟡 | `SimulatorPage.tsx` (valor/fecha/medio/cuenta; falta "necesaria" y "todas las tarjetas"/"cuotas") |
| Pago con cuenta: validar saldo, saldo después, afecta pagos, mínimo de emergencia | 🟡 | valida saldo y saldo después; falta mínimo de emergencia y choque con pagos |
| Pago con tarjeta: cupo, corte, fecha real de pago, días sin interés, cuotas, impacto deuda, utilización | 🟡 | `recommendCardForPurchase` cubre float/cupo/utilización; falta días sin interés explícito y cuotas |
| Recomendación: mejor medio, comprar/esperar, riesgo bajo/medio/alto, razón | 🟡 | recomienda tarjeta + razón; **falta** nivel de riesgo y "comprar/esperar" |
| Funciones EXACTAS: `simulateCashPurchase`, `simulateCreditCardPurchase`, `calculateDaysUntilPayment`, `calculateCardCutoffImpact`, `rankPaymentOptions`, `calculatePurchaseRisk`, `recommendBestPaymentMethod` | ❌ | solo `recommendCardForPurchase` (lógica inline en la página) |
| Guardar en `purchase_simulations` | ✅ | tabla + `useSaveSimulation()` |
| Botón convertir simulación → transacción real | ❌ | no existe |

---

## promt/8.md — Importación CSV
**Estado global: ❌ no implementado (0%)**

- ❌ Sin pantalla "Importar CSV", sin ruta.
- ❌ `papaparse` **no** está en dependencias.
- ❌ Sin funciones `parseCsvFile`, `normalizeCsvRow`, `mapCsvColumnsToTransaction`, `detectDuplicateTransactions`, `validateImportedTransactions`, `importTransactionsBatch`.
- ❌ Sin tabla `csv_imports`.
- ⚠️ CLAUDE.md declara CSV como **fuera de alcance de v1** (coherente con que no esté hecho).

---

## promt/9.md — PWA instalable (foco iPhone)
**Estado global: 🟡 mayormente completo (~70%)**

| Punto | Estado | Evidencia |
|---|---|---|
| `vite-plugin-pwa` configurado | ✅ | `vite.config.ts` (`registerType: autoUpdate`) |
| Manifest (name, short_name, description, start_url, standalone, colors, icons, orientation, categories) | ✅ | manifest generado por el plugin |
| Iconos 192/512/maskable/apple-touch/favicon | ✅ | `public/icons/`, `scripts/generate-icons.mjs` |
| Meta iOS (capable, title, status-bar, apple-touch, viewport) | ✅ | `index.html` |
| Service worker + estrategia de cache | ✅ | NetworkFirst para Supabase, CacheFirst para estáticos |
| No cachear datos financieros sensibles | ⚠️ | NetworkFirst cachea respuestas de la API (status 0/200); revisar exclusión de datos sensibles |
| Pantalla offline | ❌ | no existe fallback offline |
| Componente `InstallPrompt` (iOS/Android/desktop) | ❌ | no existe |

---

## promt/10.md — Guía de estilo visual (no es feature)
**Estado global: 🟡 en progreso (rediseño en curso)**

Pide: fondo claro, tipografía grande y redondeada, números enormes, pocas gráficas muy visuales, tarjetas "píldora"/barras suaves, colores pastel, bordes redondeados, mucho espacio en blanco, interacciones rápidas, **mobile-first**, **botón flotante de acción principal**, lenguaje visual amigable.

- ✅ Mobile-first, bordes redondeados (radius 1rem), tarjetas suaves (`shadow-soft`), números grandes (`tnum`), botón de acción central en el bottom-nav, transiciones/gestos (framer-motion + vaul).
- 🟡 Paleta elegida = **índigo/violeta vibrante con gradientes** (no exactamente pastel); decisión de producto tomada en esta sesión.
- 🔄 El rediseño de todas las páginas/formularios a este lenguaje está **en ejecución** (workflow multi-agente).

---

## Conclusión rápida

- **Sólido y funcional:** Supabase/Auth/Onboarding (1), Dashboard (2), CRUD cuentas/tarjetas/deudas (3), PWA base (9), estilo base (10).
- **Funciona pero incompleto:** Transacciones (4/5) — faltan ajuste, transferencia real, edición, filtros cuenta/tarjeta/búsqueda y **atomicidad por RPC**. Cuotas (6). Simulador (7).
- **Sin empezar:** Importación CSV (8) — declarado fuera de alcance de v1.
- **Brechas transversales más importantes:** (a) sin RPC atómica para movimientos que tocan varias tablas; (b) varias **funciones puras con los nombres exactos** que piden los prompts no existen (la lógica está agrupada en helpers); (c) sin edición de transacciones; (d) sin offline/InstallPrompt en PWA.
