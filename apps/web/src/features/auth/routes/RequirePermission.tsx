import { Outlet, useLocation } from 'react-router-dom';
import { navigationForPath } from '../../../app/navigation';
import { NoPermissionState } from '../../../components/NoPermissionState';
import { PermissionGate } from '../components/PermissionGate';

export function RequirePermission() {
  const { pathname } = useLocation();
  if (pathname === '/') return <Outlet />;
  const route = navigationForPath(pathname);
  if (!route?.permission) return <NoPermissionState />;
  return (
    <PermissionGate permission={route.permission} fallback={<NoPermissionState />}>
      <Outlet />
    </PermissionGate>
  );
}
