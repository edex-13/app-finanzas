import { useMemo } from 'react'
import { useAccounts } from '@/features/accounts/hooks'
import {
  useDebtInstallments,
} from '@/features/debts/hooks'
import {
  useRecurringTransactions,
} from '@/features/transactions/hooks'
import { useSalaryPeriods } from '@/features/income/hooks'
import {
  calculateTotalAvailableMoney,
  projectFutureBalance,
} from '@/lib/financial-calculations'
import { today } from '@/lib/date-utils'
import type { ProjectedEvent } from '@/types/domain'

interface Options {
  horizonDays?: number
  extraOneOffs?: Parameters<typeof projectFutureBalance>[0]['scheduledOneOffs']
}

export function useProjection({
  horizonDays = 90,
  extraOneOffs,
}: Options = {}): {
  events: ProjectedEvent[]
  startBalance: number
  isLoading: boolean
} {
  const accounts = useAccounts()
  const installments = useDebtInstallments()
  const recurring = useRecurringTransactions()
  const salary = useSalaryPeriods()

  const startBalance = useMemo(
    () => calculateTotalAvailableMoney(accounts.data ?? []),
    [accounts.data],
  )

  const events = useMemo(() => {
    if (
      accounts.isLoading ||
      installments.isLoading ||
      recurring.isLoading ||
      salary.isLoading
    ) {
      return []
    }
    return projectFutureBalance({
      startBalance,
      asOfDate: today(),
      horizonDays,
      recurring: recurring.data ?? [],
      installments: installments.data ?? [],
      salaryPeriods: salary.data ?? [],
      scheduledOneOffs: extraOneOffs,
    })
  }, [
    accounts.isLoading,
    installments.isLoading,
    recurring.isLoading,
    salary.isLoading,
    startBalance,
    horizonDays,
    recurring.data,
    installments.data,
    salary.data,
    extraOneOffs,
  ])

  return {
    events,
    startBalance,
    isLoading:
      accounts.isLoading ||
      installments.isLoading ||
      recurring.isLoading ||
      salary.isLoading,
  }
}
