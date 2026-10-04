import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { LoginPage } from './features/auth/pages/LoginPage';
import { ProtectedRoute, PublicOnlyRoute } from './features/auth/routes/AuthRoutes';
import { AuthenticatedHomePage } from './pages/AuthenticatedHomePage';
import { AppLayout } from './components/layout/AppLayout';

// Code-splitting dinámico para carga ultrarrápida del shell principal
const PosPage = lazy(() => import('./features/sales/pages/PosPage').then((m) => ({ default: m.PosPage })));
const SalesHistoryPage = lazy(() => import('./features/sales/pages/SalesHistoryPage').then((m) => ({ default: m.SalesHistoryPage })));
const CategoriesPage = lazy(() => import('./features/catalog/pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const UnitsOfMeasurePage = lazy(() => import('./features/catalog/pages/UnitsOfMeasurePage').then((m) => ({ default: m.UnitsOfMeasurePage })));
const ProductsPage = lazy(() => import('./features/catalog/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const InventoryLotsPage = lazy(() => import('./features/inventory/pages/InventoryLotsPage').then((m) => ({ default: m.InventoryLotsPage })));
const InventoryMovementsPage = lazy(() => import('./features/inventory/pages/InventoryMovementsPage').then((m) => ({ default: m.InventoryMovementsPage })));
const ExpirationAlertsPage = lazy(() => import('./features/alerts/pages/ExpirationAlertsPage').then((m) => ({ default: m.ExpirationAlertsPage })));
const ReportsPage = lazy(() => import('./features/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const BackupManagementPage = lazy(() => import('./features/backups/pages/BackupManagementPage').then((m) => ({ default: m.BackupManagementPage })));
const UsersPage = lazy(() => import('./features/users/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const SuppliersPage = lazy(() => import('./features/suppliers/pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const CustomersPage = lazy(() => import('./features/customers/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const PurchasesListPage = lazy(() => import('./features/purchases/pages/PurchasesListPage').then((m) => ({ default: m.PurchasesListPage })));
const ReceivePurchasePage = lazy(() => import('./features/purchases/pages/ReceivePurchasePage').then((m) => ({ default: m.ReceivePurchasePage })));
const CashPage = lazy(() => import('./features/cash/pages/CashPage').then((m) => ({ default: m.CashPage })));
const TreasuryBankAccountsPage = lazy(() => import('./features/treasury/pages/TreasuryBankAccountsPage').then((m) => ({ default: m.TreasuryBankAccountsPage })));
const ReceivablesPage = lazy(() => import('./features/receivables/pages/ReceivablesPage').then((m) => ({ default: m.ReceivablesPage })));
const PayablesPage = lazy(() => import('./features/payables/pages/PayablesPage').then((m) => ({ default: m.PayablesPage })));
const ExpensesPage = lazy(() => import('./features/expenses/pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const AccountsPage = lazy(() => import('./features/accounting/pages/AccountingPages').then((m) => ({ default: m.AccountsPage })));
const PurposesPage = lazy(() => import('./features/accounting/pages/AccountingPages').then((m) => ({ default: m.PurposesPage })));
const ImportAccountsPage = lazy(() => import('./features/accounting/pages/AccountingPages').then((m) => ({ default: m.ImportAccountsPage })));
const JournalEntriesPage = lazy(() => import('./features/accounting/pages/JournalEntriesPage').then((m) => ({ default: m.JournalEntriesPage })));
const TrialBalancePage = lazy(() => import('./features/accounting/pages/TrialBalancePage').then((m) => ({ default: m.TrialBalancePage })));
const IncomeStatementPage = lazy(() => import('./features/accounting/pages/IncomeStatementPage').then((m) => ({ default: m.IncomeStatementPage })));
const BalanceSheetPage = lazy(() => import('./features/accounting/pages/BalanceSheetPage').then((m) => ({ default: m.BalanceSheetPage })));
const FiscalPeriodsPage = lazy(() => import('./features/accounting/pages/FiscalPeriodsPage').then((m) => ({ default: m.FiscalPeriodsPage })));

const RouteLoadingFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
    <CircularProgress size={36} />
  </Box>
);

export const App = () => {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<AuthenticatedHomePage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/sales" element={<SalesHistoryPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/units-of-measure" element={<UnitsOfMeasurePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/inventory/lots" element={<InventoryLotsPage />} />
            <Route path="/inventory/movements" element={<InventoryMovementsPage />} />
            <Route path="/alerts" element={<ExpirationAlertsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/backups" element={<BackupManagementPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/purchases" element={<PurchasesListPage />} />
            <Route path="/purchases/receive" element={<ReceivePurchasePage />} />
            <Route path="/cash" element={<CashPage />} />
            <Route path="/treasury/bank-accounts" element={<TreasuryBankAccountsPage />} />
            <Route path="/receivables" element={<ReceivablesPage />} />
            <Route path="/payables" element={<PayablesPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/accounting/accounts" element={<AccountsPage />} />
            <Route path="/accounting/purposes" element={<PurposesPage />} />
            <Route path="/accounting/import" element={<ImportAccountsPage />} />
            <Route path="/accounting/journal" element={<JournalEntriesPage />} />
            <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
            <Route path="/accounting/income-statement" element={<IncomeStatementPage />} />
            <Route path="/accounting/balance-sheet" element={<BalanceSheetPage />} />
            <Route path="/accounting/periods" element={<FiscalPeriodsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
