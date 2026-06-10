/**
 * Constantes y cálculos de derecho laboral colombiano (estimaciones para
 * proyección personal; el usuario puede ajustar montos manualmente).
 *
 * Todas las funciones son PURAS (sin Supabase/React) y testeables.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Salario mínimo mensual legal vigente (COP). 2026 estimado.
 * Se usa solo como referencia para el tope del Fondo de Solidaridad Pensional.
 */
export const SMMLV_2026 = 1_623_500

/** Deducción de salud a cargo del empleado. */
export const HEALTH_RATE = 0.04
/** Deducción de pensión a cargo del empleado. */
export const PENSION_RATE = 0.04

/** Año laboral contable (días) usado para prima/cesantías. */
export const LABOR_YEAR_DAYS = 360
/** Tasa anual de intereses sobre cesantías (12%). */
export const CESANTIAS_INTEREST_RATE = 0.12

// ---------------------------------------------------------------------------
// Deducciones de ley (sobre el salario mensual)
// ---------------------------------------------------------------------------

/** Salud: 4% del salario base. */
export function calculateHealthDeduction(monthlySalary: number): number {
  return round(Math.max(0, monthlySalary) * HEALTH_RATE)
}

/** Pensión: 4% del salario base. */
export function calculatePensionDeduction(monthlySalary: number): number {
  return round(Math.max(0, monthlySalary) * PENSION_RATE)
}

/**
 * Fondo de Solidaridad Pensional (FSP). Aplica solo si el salario supera
 * 4 SMMLV, de forma escalonada (Ley 100):
 *   < 4 SMMLV        → 0%
 *   [4, 16) SMMLV    → 1%
 *   [16, 17) SMMLV   → 1.2%
 *   [17, 18) SMMLV   → 1.4%
 *   [18, 19) SMMLV   → 1.6%
 *   [19, 20) SMMLV   → 1.8%
 *   >= 20 SMMLV      → 2%
 */
export function calculateFSP(monthlySalary: number, smmlv = SMMLV_2026): number {
  const n = monthlySalary / smmlv
  let rate = 0
  if (n >= 20) rate = 0.02
  else if (n >= 19) rate = 0.018
  else if (n >= 18) rate = 0.016
  else if (n >= 17) rate = 0.014
  else if (n >= 16) rate = 0.012
  else if (n >= 4) rate = 0.01
  return round(monthlySalary * rate)
}

export interface SalaryBreakdown {
  gross: number
  health: number
  pension: number
  fsp: number
  totalDeductions: number
  net: number
}

/**
 * Desglose del salario mensual: bruto, deducciones de ley y neto que
 * efectivamente llega a la cuenta.
 */
export function calculateNetSalary(
  monthlySalary: number,
  smmlv = SMMLV_2026,
): SalaryBreakdown {
  const gross = Math.max(0, monthlySalary)
  const health = calculateHealthDeduction(gross)
  const pension = calculatePensionDeduction(gross)
  const fsp = calculateFSP(gross, smmlv)
  const totalDeductions = round(health + pension + fsp)
  return {
    gross: round(gross),
    health,
    pension,
    fsp,
    totalDeductions,
    net: round(gross - totalDeductions),
  }
}

// ---------------------------------------------------------------------------
// Prestaciones sociales
// ---------------------------------------------------------------------------

/**
 * Cesantías (capital): un salario mensual por año trabajado, prorrateado por
 * días. Fórmula: salario × díasTrabajados / 360. NO se consignan a la cuenta
 * del empleado (van a un fondo); se muestran como informativas.
 */
export function calculateCesantias(
  monthlySalary: number,
  daysWorked: number,
): number {
  if (monthlySalary <= 0 || daysWorked <= 0) return 0
  return round((monthlySalary * daysWorked) / LABOR_YEAR_DAYS)
}

/**
 * Intereses sobre cesantías: 12% anual sobre las cesantías acumuladas,
 * prorrateado por días. SÍ van a la cuenta del empleado (cada enero).
 */
export function calculateCesantiasInterestCO(
  cesantiasAccumulated: number,
  daysWorked: number,
): number {
  if (cesantiasAccumulated <= 0 || daysWorked <= 0) return 0
  return round(
    (cesantiasAccumulated * CESANTIAS_INTEREST_RATE * daysWorked) /
      LABOR_YEAR_DAYS,
  )
}

/**
 * Prima de servicios: equivale a un salario al año, pagado en dos cuotas
 * (junio y diciembre). Para un semestre completo = medio salario.
 * Fórmula: salario × díasTrabajadosSemestre / 360.
 */
export function calculatePrimaCO(
  monthlySalary: number,
  daysWorkedInSemester: number,
): number {
  if (monthlySalary <= 0 || daysWorkedInSemester <= 0) return 0
  return round((monthlySalary * daysWorkedInSemester) / LABOR_YEAR_DAYS)
}

export interface YearlyBenefits {
  /** Prima total estimada del año (dos semestres). */
  prima: number
  /** Cesantías acumuladas del año (NO van a la cuenta). */
  cesantias: number
  /** Intereses sobre cesantías (SÍ van a la cuenta, en enero). */
  cesantiasInterest: number
  /** Suma de lo que efectivamente entra a la cuenta (prima + intereses). */
  cashToAccount: number
}

/**
 * Prestaciones de ley estimadas para un año calendario, según el salario
 * mensual y los días efectivamente trabajados en el año (máx 360).
 */
export function calculateYearlyBenefits(
  monthlySalary: number,
  daysWorkedInYear: number,
): YearlyBenefits {
  const days = Math.max(0, Math.min(LABOR_YEAR_DAYS, daysWorkedInYear))
  // prima = un salario al año prorrateado por días trabajados
  const prima = calculatePrimaCO(monthlySalary, days)
  const cesantias = calculateCesantias(monthlySalary, days)
  const cesantiasInterest = calculateCesantiasInterestCO(cesantias, days)
  return {
    prima,
    cesantias,
    cesantiasInterest,
    cashToAccount: round(prima + cesantiasInterest),
  }
}

// ---------------------------------------------------------------------------
// Prestaciones con HISTORIAL de sueldos (aumentos / cambios de salario)
// ---------------------------------------------------------------------------

/**
 * Un tramo del historial: desde start_date rige monthly_amount. El tramo
 * termina donde empieza el siguiente (ordenado por fecha) o sigue vigente.
 */
export interface SalarySegment {
  monthly_amount: number
  start_date: string // ISO yyyy-MM-dd
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function daysInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
}

/** Sueldo vigente en una fecha según el historial (0 si no hay tramo aún). */
export function salaryOnDate(history: SalarySegment[], date: Date): number {
  let amount = 0
  for (const h of [...history].sort((a, b) =>
    a.start_date < b.start_date ? -1 : 1,
  )) {
    if (parseISO(h.start_date) <= date) amount = Number(h.monthly_amount)
    else break
  }
  return amount
}

/**
 * Parte el rango [from, to] en tramos {salario, días} según el historial,
 * recortado al periodo de empleo. Base de los cálculos prorrateados.
 */
export function salarySegmentsInRange(
  history: SalarySegment[],
  from: Date,
  to: Date,
  employment: { start: Date; end?: Date | null },
): { amount: number; days: number }[] {
  const sorted = [...history].sort((a, b) =>
    a.start_date < b.start_date ? -1 : 1,
  )
  const rangeStart = employment.start > from ? employment.start : from
  const rangeEnd = employment.end && employment.end < to ? employment.end : to
  if (sorted.length === 0 || rangeEnd < rangeStart) return []

  const out: { amount: number; days: number }[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    const segStart = parseISO(sorted[i].start_date)
    const segEnd =
      i + 1 < sorted.length
        ? new Date(parseISO(sorted[i + 1].start_date).getTime() - 86_400_000)
        : rangeEnd
    const s = segStart > rangeStart ? segStart : rangeStart
    const e = segEnd < rangeEnd ? segEnd : rangeEnd
    if (e < s) continue
    out.push({ amount: Number(sorted[i].monthly_amount), days: daysInclusive(s, e) })
  }
  return out
}

/** Promedio mensual ponderado por días trabajados dentro del rango. */
export function averageSalaryInRange(
  history: SalarySegment[],
  from: Date,
  to: Date,
  employment: { start: Date; end?: Date | null },
): number {
  const segs = salarySegmentsInRange(history, from, to, employment)
  const days = segs.reduce((a, s) => a + s.days, 0)
  if (days === 0) return 0
  return round(segs.reduce((a, s) => a + s.amount * s.days, 0) / days)
}

/**
 * Prima de un semestre con historial: Σ(salario_tramo × días_tramo)/360 sobre
 * el semestre (ene–jun o jul–dic) recortado al empleo. Tope 180 días.
 */
export function calculatePrimaForSemester(
  history: SalarySegment[],
  year: number,
  half: 1 | 2,
  employment: { start: Date; end?: Date | null },
): number {
  const from = half === 1 ? new Date(year, 0, 1) : new Date(year, 6, 1)
  const to = half === 1 ? new Date(year, 5, 30) : new Date(year, 11, 31)
  const segs = salarySegmentsInRange(history, from, to, employment)
  let total = 0
  let days = 0
  for (const s of segs) {
    const d = Math.min(s.days, 180 - days)
    if (d <= 0) break
    total += (s.amount * d) / LABOR_YEAR_DAYS
    days += d
  }
  return round(total)
}

/**
 * Cesantías del año con historial (regla CO): si el salario cambió en los
 * últimos 3 meses del periodo, la base es el PROMEDIO de lo devengado en el
 * año; si no, el último salario. Capital = base × díasTrabajados / 360.
 */
export function calculateCesantiasFromHistory(
  history: SalarySegment[],
  year: number,
  employment: { start: Date; end?: Date | null },
): { base: number; days: number; cesantias: number; interest: number } {
  const from = new Date(year, 0, 1)
  const to =
    employment.end && employment.end < new Date(year, 11, 31)
      ? employment.end
      : new Date(year, 11, 31)
  const segs = salarySegmentsInRange(history, from, to, employment)
  const days = Math.min(
    LABOR_YEAR_DAYS,
    segs.reduce((a, s) => a + s.days, 0),
  )
  if (days <= 0) return { base: 0, days: 0, cesantias: 0, interest: 0 }

  const threeMonthsBefore = new Date(to.getFullYear(), to.getMonth() - 3, to.getDate())
  const changedRecently = history.some((h) => {
    const d = parseISO(h.start_date)
    return d > threeMonthsBefore && d <= to
  })
  const base = changedRecently
    ? averageSalaryInRange(history, from, to, employment)
    : salaryOnDate(history, to)

  const cesantias = round((base * days) / LABOR_YEAR_DAYS)
  const interest = calculateCesantiasInterestCO(cesantias, days)
  return { base: round(base), days, cesantias, interest }
}

export interface YearlyBenefitsDetailed {
  /** Prima del primer semestre (se paga ~30 jun). */
  primaJun: number
  /** Prima del segundo semestre (se paga ~20 dic). */
  primaDec: number
  /** Cesantías del año (capital, va al fondo en feb del año siguiente). */
  cesantias: number
  /** Intereses de cesantías (a la cuenta, máx 31 ene del año siguiente). */
  cesantiasInterest: number
  /** Prima jun + prima dic + intereses: lo que entra a la cuenta. */
  cashToAccount: number
}

/**
 * Prestaciones del año calendario usando el historial de sueldos: cada tramo
 * aporta proporcional a sus días. Es la versión con aumentos de
 * calculateYearlyBenefits.
 */
export function calculateYearlyBenefitsFromHistory(
  history: SalarySegment[],
  year: number,
  employment: { start: Date; end?: Date | null },
): YearlyBenefitsDetailed {
  const primaJun = calculatePrimaForSemester(history, year, 1, employment)
  const primaDec = calculatePrimaForSemester(history, year, 2, employment)
  const ces = calculateCesantiasFromHistory(history, year, employment)
  return {
    primaJun,
    primaDec,
    cesantias: ces.cesantias,
    cesantiasInterest: ces.interest,
    cashToAccount: round(primaJun + primaDec + ces.interest),
  }
}

// ---------------------------------------------------------------------------
function round(v: number): number {
  return Math.round(v * 100) / 100
}
