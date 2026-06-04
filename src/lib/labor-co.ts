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
function round(v: number): number {
  return Math.round(v * 100) / 100
}
