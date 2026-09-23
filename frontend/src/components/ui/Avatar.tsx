/**
 * Avatar: photo when available, otherwise initials on a tint derived from the
 * name (stable per person, so the same student always gets the same colour).
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const TINTS = [
  'bg-primary-fixed text-on-primary-fixed',
  'bg-tertiary-fixed text-on-tertiary-fixed',
  'bg-secondary-fixed text-on-secondary-fixed',
  'bg-success-container text-on-success-container',
  'bg-warning-container text-on-warning-container',
  'bg-surface-container-highest text-primary',
];

function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-label-md',
  lg: 'h-12 w-12 text-title-md',
  xl: 'h-20 w-20 text-headline-sm',
} as const;

interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
  dimmed?: boolean;
}

export function Avatar({ name, src, size = 'md', className, dimmed }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const base = cn('shrink-0 rounded-full shadow-sm', SIZES[size], dimmed && 'opacity-80', className);
  if (src && !failed) {
    return <img src={src} alt="" className={cn(base, 'object-cover')} onError={() => setFailed(true)} loading="lazy" />;
  }
  return (
    <span className={cn(base, 'inline-flex select-none items-center justify-center font-bold', tintFor(name))} aria-hidden>
      {initials(name)}
    </span>
  );
}
