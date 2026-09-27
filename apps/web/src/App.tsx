import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/pages/LoginPage';
import { ProtectedRoute, PublicOnlyRoute } from './features/auth/routes/AuthRoutes';
import { AuthenticatedHomePage } from './pages/AuthenticatedHomePage';
import { CategoriesPage } from './features/catalog/pages/CategoriesPage';
import { UnitsOfMeasurePage } from './features/catalog/pages/UnitsOfMeasurePage';
import { ProductsPage } from './features/catalog/pages/ProductsPage';
import { InventoryLotsPage } from './features/inventory/pages/InventoryLotsPage';
import { InventoryMovementsPage } from './features/inventory/pages/InventoryMovementsPage';
import { SuppliersPage } from './features/suppliers/pages/SuppliersPage';
import { PurchasesListPage } from './features/purchases/pages/PurchasesListPage';
import { ReceivePurchasePage } from './features/purchases/pages/ReceivePurchasePage';
import { CashPage } from './features/cash/pages/CashPage';
import { CustomersPage } from './features/customers/pages/CustomersPage';
import { PosPage } from './features/sales/pages/PosPage';
import { SalesHistoryPage } from './features/sales/pages/SalesHistoryPage';
import { ReceivablesPage } from './features/receivables/pages/ReceivablesPage';
import { PayablesPage } from './features/payables/pages/PayablesPage';
import { ExpirationAlertsPage } from './features/alerts/pages/ExpirationAlertsPage';
import { ReportsPage } from './features/reports/pages/ReportsPage';
import { BackupManagementPage } from './features/backups/pages/BackupManagementPage';
import { UsersPage } from './features/users/pages/UsersPage';

import { AppLayout } from './components/layout/AppLayout';

export const App = () => {
  return (
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
          <Route path="/receivables" element={<ReceivablesPage />} />
          <Route path="/payables" element={<PayablesPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
