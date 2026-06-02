import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RequireOnboarding } from '@/features/auth/RequireOnboarding'
import { AppShell } from '@/components/layout/AppShell'
import { paths } from '@/routes/paths'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { CreditCardsPage } from '@/features/credit-cards/CreditCardsPage'
import { DebtsPage } from '@/features/debts/DebtsPage'
import { IncomePage } from '@/features/income/IncomePage'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { ProjectionsPage } from '@/features/projections/ProjectionsPage'
import { SimulatorPage } from '@/features/simulator/SimulatorPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const router = createBrowserRouter([
  { path: paths.login, element: <LoginPage /> },
  { path: paths.register, element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: paths.onboarding,
        element: <OnboardingWizard />,
      },
      {
        element: <RequireOnboarding />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: paths.dashboard, element: <DashboardPage /> },
              { path: paths.accounts, element: <AccountsPage /> },
              { path: paths.cards, element: <CreditCardsPage /> },
              { path: paths.debts, element: <DebtsPage /> },
              { path: paths.income, element: <IncomePage /> },
              { path: paths.transactions, element: <TransactionsPage /> },
              { path: paths.projections, element: <ProjectionsPage /> },
              { path: paths.simulator, element: <SimulatorPage /> },
              { path: paths.settings, element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={paths.dashboard} replace /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
