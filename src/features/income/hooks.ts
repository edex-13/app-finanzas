import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type {
  IncomeSourceRow,
  SalaryHistoryRow,
  SalaryPeriodRow,
} from '@/types/database'
import type {
  IncomeSourceInput,
  SalaryHistoryEntryInput,
} from '@/lib/validations'
import { calculateBiweeklySalary } from '@/lib/financial-calculations'
import {
  calculateNetSalary,
  calculatePrimaForSemester,
  calculateCesantiasFromHistory,
  salaryOnDate,
  type SalarySegment,
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

/** Historial de sueldos de TODAS las fuentes del usuario, por fecha. */
export function useSalaryHistory() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.salaryHistory(user.id) : ['salary_history', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_history')
        .select('*')
        .eq('user_id', user!.id)
        .order('start_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as SalaryHistoryRow[]
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

/**
 * Genera los periodos salariales futuros (6 meses) + prestaciones de ley a
 * partir del HISTORIAL de sueldos. Cada periodo usa el sueldo vigente en su
 * fecha (si registraste un aumento futuro, los meses posteriores ya lo usan).
 * Pura: exportada para tests.
 */
export function generateSalaryPeriods(
  income: IncomeSourceRow,
  history: SalarySegment[],
): NewPeriod[] {
  const out: NewPeriod[] = []
  const start = today()
  const employment = {
    start: fromISODate(income.start_date),
    end: income.end_date ? fromISODate(income.end_date) : null,
  }
  const segments: SalarySegment[] =
    history.length > 0
      ? history
      : [{ monthly_amount: income.monthly_amount, start_date: income.start_date }]

  // --- Sueldos mensuales/quincenales: NETO del sueldo vigente en cada mes ---
  for (let i = 0; i < 6; i += 1) {
    const monthStart = startOfMonth(addMonths(start, i))
    const monthEnd = endOfMonth(monthStart)
    if (employment.end && monthStart > employment.end) break
    const gross = salaryOnDate(segments, monthEnd)
    if (gross <= 0) continue
    const monthlyNet = income.includes_legal_benefits
      ? calculateNetSalary(gross).net
      : gross
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

  // --- Prestaciones de ley (Colombia), calculadas con el historial ---
  if (income.includes_legal_benefits) {
    const horizon = addMonths(start, 12)

    // Primas de este año y el siguiente que caigan dentro del horizonte.
    for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
      const dates: { date: Date; half: 1 | 2 }[] = [
        { date: new Date(year, 5, 30), half: 1 },
        { date: new Date(year, 11, 20), half: 2 },
      ]
      for (const { date, half } of dates) {
        if (date < start || date > horizon) continue
        const amount = calculatePrimaForSemester(segments, year, half, employment)
        if (amount <= 0) continue
        out.push({
          user_id: income.user_id,
          income_source_id: income.id,
          period_start: toISODate(date),
          period_end: toISODate(date),
          expected_amount: amount,
          actual_amount: null,
          type: 'prima',
        })
      }
    }

    // Cesantías del año en curso: capital al fondo (feb año sig., informativo)
    // e intereses a la cuenta (máx 31 ene año sig.).
    const year = start.getFullYear()
    const ces = calculateCesantiasFromHistory(segments, year, employment)
    const feb14 = new Date(year + 1, 1, 14)
    if (feb14 > start && ces.cesantias > 0) {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(feb14),
        period_end: toISODate(feb14),
        expected_amount: ces.cesantias,
        actual_amount: null,
        type: 'cesantias',
      })
    }
    const nextJan = new Date(year + 1, 0, 31)
    if (nextJan > start && ces.interest > 0) {
      out.push({
        user_id: income.user_id,
        income_source_id: income.id,
        period_start: toISODate(nextJan),
        period_end: toISODate(nextJan),
        expected_amount: ces.interest,
        actual_amount: null,
        type: 'cesantias_interest',
      })
    }
  }
  return out
}

/**
 * Borra los periodos futuros proyectados (actual_amount null) de la fuente y
 * los regenera desde el historial. Se llama tras cualquier cambio de sueldos.
 */
async function regenerateSalaryPeriods(
  income: IncomeSourceRow,
  history: SalarySegment[],
) {
  const { error: delErr } = await supabase
    .from('salary_periods')
    .delete()
    .eq('income_source_id', income.id)
    .is('actual_amount', null)
  if (delErr) throw delErr
  const periods = generateSalaryPeriods(income, history)
  if (periods.length > 0) {
    const { error } = await supabase.from('salary_periods').insert(periods)
    if (error) throw error
  }
}

async function fetchHistoryFor(
  incomeSourceId: string,
): Promise<SalaryHistoryRow[]> {
  const { data, error } = await supabase
    .from('salary_history')
    .select('*')
    .eq('income_source_id', incomeSourceId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as SalaryHistoryRow[]
}

/** Sincroniza income_sources.monthly_amount = sueldo vigente del historial. */
async function syncCurrentSalary(
  incomeSourceId: string,
  history: SalaryHistoryRow[],
): Promise<number> {
  const current = salaryOnDate(history, today())
  const { error } = await supabase
    .from('income_sources')
    .update({ monthly_amount: current })
    .eq('id', incomeSourceId)
  if (error) throw error
  return current
}

function invalidateIncome(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  qc.invalidateQueries({ queryKey: qk.income(userId) })
  qc.invalidateQueries({ queryKey: qk.salaryHistory(userId) })
  qc.invalidateQueries({ queryKey: qk.salaryPeriods(userId) })
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

      // El sueldo inicial es el primer tramo del historial.
      const { error: he } = await supabase.from('salary_history').insert({
        user_id: user!.id,
        income_source_id: created.id,
        monthly_amount: created.monthly_amount,
        start_date: created.start_date,
      })
      if (he) throw he

      await regenerateSalaryPeriods(created, [
        {
          monthly_amount: created.monthly_amount,
          start_date: created.start_date,
        },
      ])
      return created
    },
    onSuccess: () => invalidateIncome(qc, user!.id),
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
      const { data, error } = await supabase
        .from('income_sources')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const updated = data as IncomeSourceRow
      const history = await fetchHistoryFor(id)
      await regenerateSalaryPeriods(updated, history)
    },
    onSuccess: () => invalidateIncome(qc, user!.id),
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
    onSuccess: () => invalidateIncome(qc, user!.id),
  })
}

// ---------------------------------------------------------------------------
// Historial de sueldos: "desde esta fecha gano X". Cada mutación sincroniza el
// sueldo vigente de la fuente y regenera los periodos proyectados.
// ---------------------------------------------------------------------------

async function resyncAfterHistoryChange(incomeSourceId: string) {
  const history = await fetchHistoryFor(incomeSourceId)
  await syncCurrentSalary(incomeSourceId, history)
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('id', incomeSourceId)
    .single()
  if (error) throw error
  await regenerateSalaryPeriods(data as IncomeSourceRow, history)
}

export function useAddSalaryEntry() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      incomeSourceId,
      input,
    }: {
      incomeSourceId: string
      input: SalaryHistoryEntryInput
    }) => {
      const { error } = await supabase.from('salary_history').insert({
        user_id: user!.id,
        income_source_id: incomeSourceId,
        monthly_amount: input.monthly_amount,
        start_date: input.start_date,
      })
      if (error) throw error
      await resyncAfterHistoryChange(incomeSourceId)
    },
    onSuccess: () => invalidateIncome(qc, user!.id),
  })
}

export function useUpdateSalaryEntry() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      incomeSourceId,
      input,
    }: {
      id: string
      incomeSourceId: string
      input: SalaryHistoryEntryInput
    }) => {
      const { error } = await supabase
        .from('salary_history')
        .update({
          monthly_amount: input.monthly_amount,
          start_date: input.start_date,
        })
        .eq('id', id)
      if (error) throw error
      await resyncAfterHistoryChange(incomeSourceId)
    },
    onSuccess: () => invalidateIncome(qc, user!.id),
  })
}

export function useDeleteSalaryEntry() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      incomeSourceId,
    }: {
      id: string
      incomeSourceId: string
    }) => {
      const { error } = await supabase
        .from('salary_history')
        .delete()
        .eq('id', id)
      if (error) throw error
      await resyncAfterHistoryChange(incomeSourceId)
    },
    onSuccess: () => invalidateIncome(qc, user!.id),
  })
}
