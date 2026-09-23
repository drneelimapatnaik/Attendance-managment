/**
 * Shared frame for the student/parent auth screens (sign in, activate, reset).
 * Phone-first: a single centred column, with the institute's branding on top.
 */
import type { ReactNode } from 'react';
import { useSettings } from '@/hooks/useTenant';

interface PortalAuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function PortalAuthLayout({ title, subtitle, children, footer }: PortalAuthLayoutProps) {
  const settings = useSettings();
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="bg-primary px-space-md pb-space-xl pt-[max(2rem,env(safe-area-inset-top))] text-on-primary">
        <div className="mx-auto flex max-w-md items-center gap-space-xs">
          <img
            src={settings.logoUrl || '/icon.svg'}
            alt=""
            className="h-10 w-10 rounded-xl bg-surface-container-lowest object-contain p-1"
          />
          <div className="min-w-0">
            <p className="truncate font-title-md text-title-md">{settings.name}</p>
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-primary-container">EduTrack</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-space-lg w-full max-w-md flex-1 px-space-md pb-space-xl">
        <div className="card p-space-lg">
          <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
          {subtitle && <p className="mt-1 font-body-md text-body-md text-secondary">{subtitle}</p>}
          <div className="mt-space-md">{children}</div>
        </div>
        {footer && <div className="mt-space-md">{footer}</div>}
      </main>
    </div>
  );
}
