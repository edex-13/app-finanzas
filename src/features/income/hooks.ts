import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, endOfMonth, getDaysInYear, startOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { IncomeSourceRow, SalaryPeriodRow } from '@/types/database'
import type { IncomeSourceInput } from '@/lib/validations'
import {
  calculateBiweeklySalary,
  calculateCesantiasInterest,
  calculateEstimatedPrima,
} from '@/lib/financial-calculations'
import { fromISODate, today, toISODate } from '@/lib/date-utils'

export function useIncomeSources() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.income(user.id) : ['income', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as IncomeSourceRow[]
    },
  })
}

export function useSalaryPeriods() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.salaryPeriods(user.id) : ['salary_periods', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_periods')
        .select('*')
        .eq('user_id', user!.id)
        .order('period_end', { ascending: true })
      if (error) throw error
      return (data ?? []) as SalaryPeriodRow[]
    },
  })
}

function generateSalaryPeriods(
  income: IncomeSourceRow,
): Omit<SalaryPeriodRow, 'id' | 'created_at' | 'updated_at'>[] {
  const out: Omit<SalaryPeriodRow, 'id' | 'created_at' | 'updated_at'>[] = []
  const start = today()
  for (let i = 0; i < 6; i += 1) {
    const monthStart = startOfMonth(addMonths(start, i))
    const monthEnd = endOfMonth(monthStart)
    if (income.payment_type === 'biweekly') {
      const mid = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15)
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(monthStart),
        period_end: toISODate(mid),
        expected_amount: calculateBiweeklySalary(income.monthly_amount),
        actual_amount: null,
        type: 'regular',
      })
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(
          new Date(monthStart.getFullYear(), monthStart.getMonth(), 16),
        ),
        period_end: toISODate(monthEnd),
        expected_amount: calculateBiweeklySalary(income.monthly_amount),
        actual_amount: null,
        type: 'regular',
      })
    } else {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(monthStart),
        period_end: toISODate(monthEnd),
        expected_amount: income.monthly_amount,
        actual_amount: null,
        type: 'regular',
      })
    }
  }

  // Prima estimada (Colombia): mitad de salario en jun y dic
  if (income.includes_legal_benefits) {
    const year = start.getFullYear()
    const jun15 = new Date(year, 5, 15)
    const dec15 = new Date(year, 11, 15)
    for (const primaDate of [jun15, dec15]) {
      if (primaDate < start) continue
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(primaDate),
        period_end: toISODate(primaDate),
        expected_amount: calculateEstimatedPrima(income.monthly_amount, 180),
        actual_amount: null,
        type: 'prima',
      })
    }

    // Intereses cesantías: hasta el 31 de enero del año siguiente
    const nextJan = new Date(year + 1, 0, 31)
    if (nextJan > start) {
      const startDate = fromISODate(income.start_date)
      const daysWorked = Math.min(
        365,
        Math.max(
          0,
          Math.floor((nextJan.getTime() - startDate.getTime()) / 86_400_000),
        ),
      )
      const cesantiasAcumuladas = (income.monthly_amount * daysWorked) / 360
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(nextJan),
        period_end: toISODate(nextJan),
        expected_amount: calculateCesantiasInterest(
          cesantiasAcumuladas,
          daysWorked,
        ),
        actual_amount: null,
        type: 'cesantias_interest',
      })
    }
    // referencia silenciosa para evitar warning
    void getDaysInYear
  }
  return out
}

export function useCreateIncomeSource() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: IncomeSourceInput) => {
      const { data, error } = await supabase
        .from('income_sources')
        .insert({ ...input, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      const created = data as IncomeSourceRow
      const periods = generateSalaryPeriods(created)
      if (periods.length > 0) {
        const { error: pe } = await supabase
          .from('salary_periods')
          .insert(periods)
        if (pe) throw pe
      }
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.income(user!.id) })
      qc.invalidateQueries({ queryKey: qk.salaryPeriods(user!.id) })
    },
  })
}

export function useUpdateIncomeSource() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: IncomeSourceInput
    }) => {
      const { error } = await supabase
        .from('income_sources')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.income(user!.id) }),
  })
}

export function useDeleteIncomeSource() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('income_sources')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.income(user!.id) })
      qc.invalidateQueries({ queryKey: qk.salaryPeriods(user!.id) })
    },
  })
}
