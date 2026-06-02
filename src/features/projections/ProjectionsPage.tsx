import { useState } from 'react'
import { LineChart as LineChartIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectionLineChart } from '@/components/charts/ProjectionLineChart'
import { useProjection } from '@/hooks/useProjection'
import { formatDateShort } from '@/lib/date-utils'

const horizons = [
  { value: 30, label: '30 días' },
  { value: 60, label: '60 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '6 meses' },
]

const sourceLabel: Record<string, string> = {
  recurring: 'Recurrente',
  debt_installment: 'Cuota deuda',
  salary_period: 'Salario',
  one_off: 'Puntual',
}

export function ProjectionsPage() {
  const [horizon, setHorizon] = useState(90)
  const { events, startBalance, isLoading } = useProjection({
    horizonDays: horizon,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyección financiera"
        description="Línea de tiempo combinando ingresos esperados, deudas y recurrentes."
        action={
          <Select
            value={String(horizon)}
            onValueChange={(v) => setHorizon(Number(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {horizons.map((h) => (
                <SelectItem key={h.value} value={String(h.value)}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Saldo esperado</CardTitle>
          <CardDescription>
            Empezando en{' '}
            <MoneyDisplay value={startBalance} className="font-medium" />.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <ProjectionLineChart
              events={events}
              startBalance={startBalance}
              horizonDays={horizon}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
          <CardDescription>Cada evento con su saldo esperado después.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState
              icon={<LineChartIcon className="h-8 w-8" />}
              title="Sin eventos futuros"
              description="Agrega recurrentes, deudas o ingresos para ver tu proyección."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {formatDateShort(e.date)}
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {sourceLabel[e.source] ?? e.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyDisplay
                        value={e.signedAmount}
                        showSign
                        positiveClass="text-success"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <MoneyDisplay value={e.runningBalance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
