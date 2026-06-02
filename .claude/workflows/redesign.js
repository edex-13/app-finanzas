export const meta = {
  name: 'redesign-mobile-first',
  description: 'Rediseña todas las páginas y formularios a mobile-first moderno sobre el nuevo design system',
  phases: [
    { title: 'Redesign', detail: 'un agente por feature (página + formularios)' },
    { title: 'Verify', detail: 'typecheck + build + lint del proyecto completo' },
  ],
}

const DESIGN_CONTRACT = `
Estás rediseñando una PWA de finanzas personales (React 19 + Vite + TS strict + Tailwind v3 + shadcn-style + TanStack Query + RHF + Zod). Objetivo: MOBILE-FIRST, minimalista, moderno, llamativo, intuitivo y con gestos — pero que también se vea muy bien en escritorio. Idioma de la UI: español (es-CO).

YA EXISTE un design system nuevo que DEBES reutilizar (no reinventes, no instales nada):

TOKENS / ESTILO:
- Acento de marca = índigo/violeta. Clases utilitarias disponibles: \`bg-brand-gradient\` (fondo gradiente), \`text-brand-gradient\` (texto gradiente), \`shadow-soft\` (sombra suave). Variant de botón nuevo: \`variant="gradient"\`.
- Radios grandes: las Card ahora son rounded-2xl con shadow-soft; los inputs/botones rounded-xl, h-11. NO uses shadow-sm ni rounded-md manualmente; deja que los primitivos lo hagan.
- Colores semánticos: text-success / text-warning / text-destructive / text-muted-foreground. Para dinero usa SIEMPRE <MoneyDisplay value={...} className="tnum" /> y para columnas numéricas la clase \`tnum\`.
- Safe areas: clases \`safe-pt\`, \`safe-pb\`, \`safe-px\` ya definidas. El AppShell ya maneja el padding global; NO añadas padding fijo de bottom nav en las páginas.

COMPONENTES NUEVOS QUE DEBES USAR:
- Modal adaptativo (bottom-sheet en móvil con swipe-to-dismiss, diálogo centrado en desktop):
  import { ResponsiveModal } from '@/components/ui/responsive-modal'
  <ResponsiveModal open={open} onOpenChange={setOpen} title="..." description="...">{children}</ResponsiveModal>
  → REEMPLAZA todos los usos de <Dialog>/<DialogContent> para crear/editar por <ResponsiveModal>. Los formularios van DENTRO como children. Quita el <DialogHeader>/<DialogTitle> manual (ResponsiveModal ya pone el título).
- Animaciones de lista escalonadas:
  import { MotionList, MotionItem, Pressable } from '@/components/common/Motion'
  Envuelve grids/listas de cards en <MotionList className="grid ..."> y cada item en <MotionItem>. Usa <Pressable> para tarjetas tappables (da feedback de escala al tocar).
- framer-motion está disponible si necesitas micro-animaciones puntuales.

PATRONES MÓVIL OBLIGATORIOS:
- Listas de entidades (cuentas, tarjetas, deudas, etc.): en móvil muéstralas como CARDS apiladas (no tablas). Si ya hay tablas, conviértelas a cards en móvil y opcionalmente tabla en md+ (o cards en todos lados, que es lo preferible para esta app). Cada card: nombre + datos clave + monto grande con tnum + acciones (editar/eliminar) accesibles. Toca objetivos >= 44px.
- Botón de acción principal "Agregar/Nuevo": en el PageHeader como action en desktop, y/o como botón ancho arriba de la lista en móvil. Usa variant="gradient" para la acción principal de la página.
- Estados vacíos: usa <EmptyState icon={...} title description action> (ya rediseñado).
- Formularios: usa <FormField label error htmlFor> + <Input>/<MoneyInput>/<Select>/<Textarea> existentes. En móvil los campos van apilados (una columna); en sm+ puedes usar grid de 2 columnas. Botones del form: el submit a ancho completo en móvil (w-full) con variant="gradient" o "default", cancelar como ghost. inputMode adecuado en numéricos.
- NO rompas la lógica: mantén intactos los hooks de TanStack Query, mutaciones, validaciones Zod, RHF, y el comportamiento. Esto es SOLO rediseño visual/estructural de la capa de presentación. No cambies nombres de props que consumen otros archivos salvo que actualices ambos lados.

REGLAS DURAS:
- TypeScript strict: el proyecto DEBE seguir compilando con \`npx tsc -b\` sin errores. No uses \`any\`. Importa tipos que necesites.
- No instales dependencias. No toques supabase/, ni los archivos de @/lib/* salvo que sea estrictamente necesario y seguro.
- No edites archivos fuera de los que se te asignan, EXCEPTO que puedas leer cualquier archivo para entender convenciones.
- Mantén date-fns fuera de componentes: usa helpers de @/lib/date-utils.
- Conserva accesibilidad: labels, aria donde aplique.

Lee primero los archivos asignados y archivos vecinos (sus hooks.ts) para entender la data, luego reescríbelos. Devuelve SOLO un resumen de qué cambiaste por archivo.
`

const GROUPS = [
  {
    key: 'accounts',
    label: 'Cuentas',
    files: ['src/features/accounts/AccountsPage.tsx', 'src/features/accounts/AccountForm.tsx'],
  },
  {
    key: 'cards',
    label: 'Tarjetas',
    files: ['src/features/credit-cards/CreditCardsPage.tsx', 'src/features/credit-cards/CreditCardForm.tsx'],
  },
  {
    key: 'debts',
    label: 'Deudas',
    files: ['src/features/debts/DebtsPage.tsx', 'src/features/debts/DebtForm.tsx'],
  },
  {
    key: 'income',
    label: 'Ingresos',
    files: ['src/features/income/IncomePage.tsx', 'src/features/income/IncomeForm.tsx'],
  },
  {
    key: 'transactions',
    label: 'Transacciones',
    files: [
      'src/features/transactions/TransactionsPage.tsx',
      'src/features/transactions/TransactionForm.tsx',
      'src/features/transactions/RecurringForm.tsx',
    ],
  },
  {
    key: 'projections-simulator',
    label: 'Proyección y Simulador',
    files: ['src/features/projections/ProjectionsPage.tsx', 'src/features/simulator/SimulatorPage.tsx'],
  },
  {
    key: 'settings',
    label: 'Ajustes',
    files: ['src/features/settings/SettingsPage.tsx'],
  },
  {
    key: 'auth-onboarding',
    label: 'Auth y Onboarding',
    files: [
      'src/features/auth/LoginPage.tsx',
      'src/features/auth/RegisterPage.tsx',
      'src/features/onboarding/OnboardingWizard.tsx',
    ],
    extra: 'Para Login/Register: pantallas centradas, limpias, con el logo/marca (gradiente), card flotante en desktop y full-bleed cómodo en móvil. Para el OnboardingWizard: pasos claros con barra/indicador de progreso, transiciones suaves entre pasos (framer-motion), botones de navegación grandes (Atrás/Siguiente, Siguiente full-width en móvil).',
  },
]

phase('Redesign')

const results = await parallel(
  GROUPS.map((g) => () =>
    agent(
      `${DESIGN_CONTRACT}\n\nTU FEATURE: ${g.label}.\nArchivos que DEBES rediseñar (reescribir su JSX/estructura conservando la lógica):\n${g.files.map((f) => '- ' + f).join('\n')}\n${g.extra ? '\nNotas específicas: ' + g.extra : ''}\n\nLee también el hooks.ts vecino de la feature para entender la data. Aplica TODO el contrato. Al terminar, devuelve un resumen breve por archivo.`,
      { label: `redesign:${g.key}`, phase: 'Redesign' },
    ),
  ),
)

phase('Verify')

const verify = await agent(
  `Ejecuta en el repo, en este orden, y reporta el resultado de cada uno:\n1) \`npx tsc -b 2>&1 | head -60\` (debe terminar SIN errores)\n2) \`npm run build 2>&1 | tail -20\`\n3) \`npx vitest run 2>&1 | tail -6\`\n\nSi tsc o build fallan, ARREGLA los errores en los archivos de features (no en @/lib ni @/components/ui salvo que el error venga de ahí por una firma que cambió) hasta que pasen. Itera hasta que tsc y build estén verdes. Reporta exactamente qué errores encontraste y cómo los arreglaste, y pega las últimas líneas de la salida final de tsc y build.`,
  { label: 'verify:build', phase: 'Verify' },
)

return {
  redesigned: GROUPS.map((g, i) => ({ feature: g.label, summary: results[i] })),
  verification: verify,
}
