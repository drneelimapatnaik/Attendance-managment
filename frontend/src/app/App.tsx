/**
 * Root component: applies the tenant's brand theme and mounts the router.
 */
import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useDataStore } from '@/store/dataStore';
import { applyBrandTheme } from '@/config/themes';
import { PageLoader } from '@/components/ui';
import { router } from './router';

export function App() {
  const brand = useDataStore((s) => s.settings.brandTheme);
  useEffect(() => applyBrandTheme(brand), [brand]);

  return (
    <Suspense fallback={<PageLoader />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
