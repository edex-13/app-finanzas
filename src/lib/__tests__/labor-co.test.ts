import { describe, it, expect } from 'vitest'
import {
  SMMLV_2026,
  calculateHealthDeduction,
  calculatePensionDeduction,
  calculateFSP,
  calculateNetSalary,
  calculateCesantias,
  calculateCesantiasInterestCO,
  calculatePrimaCO,
  calculateYearlyBenefits,
  salaryOnDate,
  averageSalaryInRange,
  calculatePrimaForSemester,
  calculateCesantiasFromHistory,
  calculateYearlyBenefitsFromHistory,
} from '../labor-co'

describe('deducciones de ley', () => {
  it('salud y pensión son 4% cada una', () => {
    expect(calculateHealthDeduction(2_000_000)).toBe(80_000)
    expect(calculatePensionDeduction(2_000_000)).toBe(80_000)
  })

  it('FSP: 0% bajo 4 SMMLV, 1% entre 4 y 16, escalonado arriba', () => {
    expect(calculateFSP(SMMLV_2026 * 2)).toBe(0) // < 4 SMMLV
    expect(calculateFSP(SMMLV_2026 * 5)).toBe(round(SMMLV_2026 * 5 * 0.01)) // 1%
    expect(calculateFSP(SMMLV_2026 * 20)).toBe(round(SMMLV_2026 * 20 * 0.02)) // 2%
  })

  it('calculateNetSalary descuenta salud+pensión(+FSP) del bruto', () => {
    const low = calculateNetSalary(2_000_000)
    // < 4 SMMLV: solo 8%
    expect(low.fsp).toBe(0)
    expect(low.totalDeductions).toBe(160_000)
    expect(low.net).toBe(1_840_000)

    const high = calculateNetSalary(SMMLV_2026 * 5)
    expect(high.fsp).toBeGreaterThan(0)
    expect(high.net).toBe(round(high.gross - high.totalDeductions))
  })
})

describe('prestaciones sociales', () => {
  it('cesantías = un salario al año (prorrateado)', () => {
    expect(calculateCesantias(1_800_000, 360)).toBe(1_800_000)
    expect(calculateCesantias(1_800_000, 180)).toBe(900_000)
    expect(calculateCesantias(1_800_000, 0)).toBe(0)
  })

  it('intereses de cesantías = 12% anual', () => {
    expect(calculateCesantiasInterestCO(1_000_000, 360)).toBe(120_000)
    expect(calculateCesantiasInterestCO(1_000_000, 180)).toBe(60_000)
  })

  it('prima = salario × días / 360', () => {
    expect(calculatePrimaCO(1_800_000, 360)).toBe(1_800_000)
    expect(calculatePrimaCO(1_800_000, 180)).toBe(900_000)
  })

  it('calculateYearlyBenefits separa lo que va a la cuenta', () => {
    const y = calculateYearlyBenefits(1_800_000, 360)
    expect(y.prima).toBe(1_800_000)
    expect(y.cesantias).toBe(1_800_000)
    expect(y.cesantiasInterest).toBe(216_000) // 12% de 1.8M
    // a la cuenta van prima + intereses, NO las cesantías
    expect(y.cashToAccount).toBe(1_800_000 + 216_000)
  })

  it('topea días trabajados a 360', () => {
    expect(calculateYearlyBenefits(1_000_000, 500).cesantias).toBe(1_000_000)
  })
})

describe('prestaciones con historial de sueldos (aumentos)', () => {
  // Trabajó todo 2026: ene–jun ganó 2M, desde 1 jul ganó 3M.
  const history = [
    { monthly_amount: 2_000_000, start_date: '2026-01-01' },
    { monthly_amount: 3_000_000, start_date: '2026-07-01' },
  ]
  const employment = { start: new Date(2026, 0, 1) }

  it('salaryOnDate devuelve el sueldo vigente en cada fecha', () => {
    expect(salaryOnDate(history, new Date(2026, 2, 15))).toBe(2_000_000)
    expect(salaryOnDate(history, new Date(2026, 8, 1))).toBe(3_000_000)
    expect(salaryOnDate(history, new Date(2025, 11, 31))).toBe(0)
  })

  it('prima de cada semestre usa el sueldo de ese semestre', () => {
    // 1er semestre completo con 2M → media prima de 2M = 1M
    expect(calculatePrimaForSemester(history, 2026, 1, employment)).toBe(1_000_000)
    // 2º semestre completo con 3M → media prima de 3M = 1.5M
    expect(calculatePrimaForSemester(history, 2026, 2, employment)).toBe(1_500_000)
  })

  it('prima prorratea si entró a mitad de semestre', () => {
    // Entró el 1 de abril: solo abr-may-jun del 1er semestre (91 días calendario)
    const late = { start: new Date(2026, 3, 1) }
    const prima = calculatePrimaForSemester(history, 2026, 1, late)
    expect(prima).toBeGreaterThan(0)
    expect(prima).toBeLessThan(1_000_000)
  })

  it('cesantías: si el sueldo cambió en los últimos 3 meses usa el promedio', () => {
    // Cambio el 1 nov (dentro de los últimos 3 meses del año) → promedio
    const lateRaise = [
      { monthly_amount: 2_000_000, start_date: '2026-01-01' },
      { monthly_amount: 3_000_000, start_date: '2026-11-01' },
    ]
    const r = calculateCesantiasFromHistory(lateRaise, 2026, employment)
    expect(r.base).toBeGreaterThan(2_000_000)
    expect(r.base).toBeLessThan(3_000_000)
    expect(r.base).toBe(
      averageSalaryInRange(
        lateRaise,
        new Date(2026, 0, 1),
        new Date(2026, 11, 31),
        employment,
      ),
    )
  })

  it('cesantías: si el sueldo está estable usa el último salario', () => {
    // Cambio el 1 jul (hace más de 3 meses al 31 dic) → último salario 3M
    const r = calculateCesantiasFromHistory(history, 2026, employment)
    expect(r.base).toBe(3_000_000)
    expect(r.days).toBe(360)
    expect(r.cesantias).toBe(3_000_000)
    expect(r.interest).toBe(360_000) // 12%
  })

  it('calculateYearlyBenefitsFromHistory arma el año completo', () => {
    const y = calculateYearlyBenefitsFromHistory(history, 2026, employment)
    expect(y.primaJun).toBe(1_000_000)
    expect(y.primaDec).toBe(1_500_000)
    expect(y.cesantias).toBe(3_000_000)
    expect(y.cesantiasInterest).toBe(360_000)
    expect(y.cashToAccount).toBe(1_000_000 + 1_500_000 + 360_000)
  })
})

function round(v: number): number {
  return Math.round(v * 100) / 100
}
