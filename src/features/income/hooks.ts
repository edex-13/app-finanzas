import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { IncomeSourceRow, SalaryPeriodRow } from '@/types/database'
import type { IncomeSourceInput } from '@/lib/validations'
import { calculateBiweeklySalary } from '@/lib/financial-calculations'
import {
  calculateNetSalary,
  calculatePrimaCO,
  calculateCesantias,
  calculateCesantiasInterestCO,
} from '@/lib/labor-co'
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

type NewPeriod = Omit<SalaryPeriodRow, 'id' | 'created_at' | 'updated_at'>

function generateSalaryPeriods(income: IncomeSourceRow): NewPeriod[] {
  const out: NewPeriod[] = []
  const start = today()

  // Salario que llega a la cuenta = NETO (tras salud + pensión + FSP).
  // Si la fuente NO es salario con prestaciones de ley, se asume monto tal cual.
  const monthlyNet = income.includes_legal_benefits
    ? calculateNetSalary(income.monthly_amount).net
    : income.monthly_amount

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
        expected_amount: calculateBiweeklySalary(monthlyNet),
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
        expected_amount: calculateBiweeklySalary(monthlyNet),
        actual_amount: null,
        type: 'regular',
      })
    } else {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(monthStart),
        period_end: toISODate(monthEnd),
        expected_amount: monthlyNet,
        actual_amount: null,
        type: 'regular',
      })
    }
  }

  // Prestaciones de ley (Colombia). Las cantidades usan el salario BRUTO.
  if (income.includes_legal_benefits) {
    const year = start.getFullYear()
    const startDate = fromISODate(income.start_date)

    // Prima: junio (1er semestre) y diciembre (2º semestre), medio salario c/u.
    const jun30 = new Date(year, 5, 30)
    const dec20 = new Date(year, 11, 20)
    for (const primaDate of [jun30, dec20]) {
      if (primaDate < start) continue
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(primaDate),
        period_end: toISODate(primaDate),
        expected_amount: calculatePrimaCO(income.monthly_amount, 180),
        actual_amount: null,
        type: 'prima',
      })
    }

    // Días trabajados en el año hasta el cierre (31 dic), tope 360.
    const yearEnd = new Date(year, 11, 31)
    const daysWorked = Math.min(
      360,
      Math.max(
        0,
        Math.floor((yearEnd.getTime() - startDate.getTime()) / 86_400_000) + 1,
      ),
    )
    const cesantias = calculateCesantias(income.monthly_amount, daysWorked)

    // Cesantías (capital): se consignan al fondo a mediados de febrero del año
    // siguiente. INFORMATIVAS — la proyección NO las suma al saldo de la cuenta.
    const feb14 = new Date(year + 1, 1, 14)
    if (feb14 > start && cesantias > 0) {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(feb14),
        period_end: toISODate(feb14),
        expected_amount: cesantias,
        actual_amount: null,
        type: 'cesantias',
      })
    }

    // Intereses sobre cesantías: SÍ van a la cuenta, máximo 31 de enero.
    const nextJan = new Date(year + 1, 0, 31)
    if (nextJan > start && cesantias > 0) {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(nextJan),
        period_end: toISODate(nextJan),
        expected_amount: calculateCesantiasInterestCO(cesantias, daysWorked),
        actual_amount: null,
        type: 'cesantias_interest',
      })
    }
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
