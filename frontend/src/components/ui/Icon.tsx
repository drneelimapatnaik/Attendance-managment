/**
 * Material Symbols (Outlined) icon. Font is self-hosted — see src/main.tsx.
 * Browse names at https://fonts.google.com/icons.
 */
import { cn } from '@/lib/cn';

interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
  /** Provide a label only when the icon carries meaning on its own. */
  label?: string;
}

export function Icon({ name, size = 20, filled, className, label }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined shrink-0', filled && 'icon-filled', className)}
      style={{ fontSize: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}
