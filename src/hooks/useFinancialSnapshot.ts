import { useMemo } from 'react'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useDebts } from '@/features/debts/hooks'
import {
  calculateLiquidNetWorth,
  calculateTotalAvailableMoney,
  calculateTotalCreditAvailable,
  calculateTotalDebt,
} from '@/lib/financial-calculations'
import type { FinancialSnapshot } from '@/types/domain'

export function useFinancialSnapshot(): {
  data: FinancialSnapshot
  isLoading: boolean
} {
  const accounts = useAccounts()
  const cards = useCreditCards()
  const debts = useDebts()

  const data = useMemo<FinancialSnapshot>(() => {
    const accs = accounts.data ?? []
    const crds = cards.data ?? []
    const dbs = debts.data ?? []
    const cardDebt = crds
      .filter((c) => !c.archived)
      .reduce((a, c) => a + Number(c.current_debt ?? 0), 0)
    const loanDebt = dbs
      .filter((d) => !d.archived)
      .reduce((a, d) => a + Number(d.remaining_balance ?? 0), 0)
    return {
      totalAvailable: calculateTotalAvailableMoney(accs),
      totalDebt: calculateTotalDebt(dbs, crds),
      cardDebt,
      loanDebt,
      liquidNetWorth: calculateLiquidNetWorth(accs, crds, dbs),
      totalCreditAvailable: calculateTotalCreditAvailable(crds),
    }
  }, [accounts.data, cards.data, debts.data])

  return {
    data,
    isLoading: accounts.isLoading || cards.isLoading || debts.isLoading,
  }
}
