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
**Estado global: ✅ completo** (cerrado el 2026-06-03 — enfoque vertical lógica + rediseño MonAi)

| Punto | Estado | Evidencia |
|---|---|---|
| Pantalla con listado | ✅ | `TransactionsPage.tsx` |
| Filtros por fecha / tipo / categoría | ✅ | TransactionsPage |
| Filtros por cuenta / tarjeta | ✅ | `TransactionFilters` ampliado (accountId/cardId); `useTransactions` aplica `.or()` cuenta origen/destino |
| Buscador por descripción | ✅ | filtro `search` → `.ilike('note', …)` |
| Tipos: ingreso, gasto, pago deuda, pago tarjeta, transferencia | ✅ | `TransactionForm.tsx` |
| Tipo **ajuste** | ✅ | enum ampliado (`20260603000001_add_adjustment_kind.sql`); fija el saldo de la cuenta |
| Reglas ingreso/gasto/pago deuda | ✅ | RPC `create_financial_transaction` + funciones puras |
| Regla pago tarjeta sin sobrepago | ✅ | validación dura en RPC y en `applyCreditCardPaymentTransaction` (lanza error) |
| Regla transferencia (mover entre cuentas, validar saldo) | ✅ | `counterparty_account_id` + RPC valida saldo origen y patrimonio intacto |
| Gasto con tarjeta a cuotas (pide #cuotas/interés/tasa/fecha y crea cuotas) | ✅ | form pide datos; `useCreateTransaction` genera cuotas vía `generateCardInstallments` |
| Funciones puras EXACTAS: `applyIncomeTransaction`, `applyExpenseTransaction`, `applyDebtPaymentTransaction`, `applyCreditCardPaymentTransaction`, `applyTransferTransaction`, `applyAdjustmentTransaction`, `validateSufficientBalance`, `calculateTransactionImpact` | ✅ | las 8 con nombre exacto + tests en `financial-calculations.test.ts` |
| Hooks: `useTransactions`, `useCreateTransaction`, `useDeleteTransaction` | ✅ | `transactions/hooks.ts` |
| Hooks: `useUpdateTransaction`, `useTransactionFilters` | ✅ | edición de campos descriptivos (fecha/categoría/nota) + estado de filtros |
| RPC `create_financial_transaction` (atómica) | ✅ | `20260603000003_*.sql` (SECURITY DEFINER, valida auth.uid() y pertenencia) |
| UI: badges por tipo, verde/rojo, confirmación de borrado, **rediseño MonAi** | ✅ | filas-píldora, filtros-chip, detalle de impacto |

⚠️ La **edición** solo cambia campos descriptivos; para cambiar monto/cuentas el flujo es borrar y recrear (revertir el efecto de saldo con exactitud no es trivial).

---

## promt/6.md — Automatización de cuotas / deudas / pagos futuros
**Estado global: ✅ completo** (cerrado el 2026-06-03)

| Punto | Estado | Evidencia |
|---|---|---|
| Tabla `debt_installments` | ✅ | `0001` + `20260603000002` añade `paid_at`/`credit_card_id`, `debt_id` nullable (XOR deuda/tarjeta) |
| Generar cuotas futuras de una deuda | ✅ | `generateDebtInstallments()` / `generateInstallmentSchedule()` |
| Frecuencias: semanal/quincenal/mensual/cada X/personalizada | ✅ | `generateInstallmentSchedule` con `custom_days` |
| Al crear deuda: fechas, valor, registros, estado `pending` | ✅ | `useCreateDebt` |
| Al pagar cuota: marcar paid, paid_at, bajar saldo/cuotas, crear transacción | ✅ | RPC `pay_installment` (atómica) |
| Estado `late`/vencida + alerta | ✅ | RPC `mark_overdue_installments` persiste `overdue`; alerta coral en detalle de deuda |
| Compras con tarjeta a cuotas | ✅ | `generateCardInstallments` ligado al gasto-a-cuotas |
| Funciones: `generateInstallmentSchedule`, `calculateInstallmentAmount`, `markInstallmentAsPaid`, `detectLateInstallments`, `recalculateDebtProgress`, `generateCardInstallments` | ✅ | las 6 con nombre exacto + tests |
| RPC para pagar cuota atómica | ✅ | `20260603000004_rpc_pay_installment.sql` |
| UI detalle de deuda: lista de cuotas, botón "marcar pagada", progreso, próxima/vencidas, **rediseño MonAi** | ✅ | `DebtDetail.tsx` (filas-píldora, chips de estado pastel/coral, progreso) |

---

## promt/7.md — Simulador de compra
**Estado global: ✅ completo** (cerrado el 2026-06-03)

| Punto | Estado | Evidencia |
|---|---|---|
| Pantalla simulador + formulario (valor, fecha, necesaria, medio de pago, cuotas) | ✅ | `SimulatorPage.tsx` (switch necesaria, cuotas, tarjeta sugerida) |
| Pago con cuenta: validar saldo, saldo después, mínimo de emergencia, choque con pagos | ✅ | `simulateCashPurchase` (emergencyMinimum 10% heurística + upcomingCommitted) |
| Pago con tarjeta: cupo, corte, fecha real de pago, días sin interés, cuotas, impacto deuda, utilización | ✅ | `simulateCreditCardPurchase` + `calculateCardCutoffImpact` |
| Recomendación: mejor medio, comprar/esperar, riesgo bajo/medio/alto, razón | ✅ | `recommendBestPaymentMethod` (verdict buy/wait/cannot + risk) |
| Funciones EXACTAS: `simulateCashPurchase`, `simulateCreditCardPurchase`, `calculateDaysUntilPayment`, `calculateCardCutoffImpact`, `rankPaymentOptions`, `calculatePurchaseRisk`, `recommendBestPaymentMethod` | ✅ | las 7 con nombre exacto + tests |
| Guardar en `purchase_simulations` | ✅ | tabla + `useSaveSimulation()` |
| Botón convertir simulación → transacción real | ✅ | `convertToTransaction` vía RPC `create_financial_transaction` |
| **Rediseño MonAi** | ✅ | valor héroe, forma de pago en chips, veredicto semáforo, comparación en píldoras |

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

- **Sólido y funcional:** Supabase/Auth/Onboarding (1), Dashboard (2), CRUD cuentas/tarjetas/deudas (3), **Transacciones (4/5) ✅**, **Cuotas (6) ✅**, **Simulador (7) ✅**, PWA base (9), estilo base (10).
- **Sin empezar:** Importación CSV (8) — declarado fuera de alcance de v1.
- **Cerrado el 2026-06-03 (Fases 0-3 del plan vertical):** se añadieron 3 RPC atómicas
  (`create_financial_transaction`, `pay_installment`, `mark_overdue_installments`), las
  funciones puras con nombre exacto de los prompts 4/5/6/7 (+ tests), edición de
  transacciones (campos descriptivos), transferencia/ajuste reales, cuotas de deuda y de
  tarjeta con UI de pago por cuota, y simulador con riesgo/comprar-esperar/convertir a
  transacción. Cada feature rediseñada al lenguaje MonAi vía el subagente `front-monai`.
- **Pendiente operativo:** las 5 migraciones de Supabase (`supabase/migrations/2026060300000*.sql`)
  **no se han pusheado** a la nube (`npm run sb:push`); hasta entonces las RPC no existen en
  el backend y los flujos fallan en runtime.
- **Brechas transversales restantes:** (a) PWA sin offline/InstallPrompt; (b) **deuda UI/UX**:
  ~40% de la app aún no es MonAi (forms genéricos con Input/Select caja dura, gráficas
  Recharts crudas, Settings/Login/Register sin rediseñar, diálogos no bottom-sheet en móvil,
  grids sin animación) — ver plan de pulido UI/UX.
