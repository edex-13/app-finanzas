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

function round(v: number): number {
  return Math.round(v * 100) / 100
}
