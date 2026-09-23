/**
 * Guards a route or block by permission. Routes render a friendly
 * "no access" state instead of a blank page; inline blocks render nothing.
 */
import type { ReactNode } from 'react';
import type { Permission } from '@/types/domain';
import { useCan } from '@/hooks/useTenant';
import { ButtonLink, EmptyState } from '@/components/ui';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  /** 'page' shows an explanatory empty state; 'inline' renders nothing. */
  mode?: 'page' | 'inline';
}

export function RequirePermission({ permission, children, mode = 'inline' }: RequirePermissionProps) {
  const can = useCan();
  if (can(permission)) return <>{children}</>;
  if (mode === 'inline') return null;
  return (
    <div className="card">
      <EmptyState
        icon="lock"
        title="You don't have access to this page"
        description="Your role doesn't include this area. Ask your institute administrator if you need access."
        action={
          <ButtonLink to="/dashboard" variant="tonal" icon="dashboard">
            Go to dashboard
          </ButtonLink>
        }
      />
    </div>
  );
}
