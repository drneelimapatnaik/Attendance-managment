/**
 * Buttons — DESIGN.md › Components › Buttons.
 *
 *  primary    solid brand (main action per view)
 *  tonal      surface-container fill (secondary actions in the page header)
 *  secondary  white with hairline border
 *  ghost      text only (toolbars, table actions)
 *  danger     solid red (confirmed destructive actions)
 *  danger-soft pale red (secondary destructive triggers)
 *
 * Touch sizing: md is 44px tall on mobile and 40px from `md:` up.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'tonal' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container shadow-sm hover:shadow-md',
  tonal: 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high shadow-sm',
  secondary: 'bg-surface-container-lowest text-on-surface border border-outline-variant/60 hover:bg-surface-container-low',
  ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  danger: 'bg-danger text-white hover:bg-on-danger-container shadow-sm',
  'danger-soft': 'bg-danger-container text-on-danger-container hover:bg-danger hover:text-white',
  inverse: 'bg-surface-container-lowest text-primary hover:bg-surface-container-low shadow-sm',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 md:h-8 px-2.5 gap-1 text-label-md font-label-md rounded-lg',
  md: 'h-11 md:h-10 px-space-sm gap-1.5 text-label-lg font-label-lg rounded-lg',
  lg: 'h-12 px-space-md gap-2 text-title-md font-title-md rounded-xl',
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  trailingIcon?: string;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth }: Pick<CommonProps, 'variant' | 'size' | 'fullWidth'>) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, trailingIcon, loading, fullWidth, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? <Spinner size={ICON_SIZES[size]} /> : icon && <Icon name={icon} size={ICON_SIZES[size]} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={ICON_SIZES[size]} />}
    </button>
  );
});

/** A router link styled as a button. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  fullWidth,
  className,
  children,
  ...rest
}: CommonProps & LinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...rest}>
      {icon && <Icon name={icon} size={ICON_SIZES[size]} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={ICON_SIZES[size]} />}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required: announced to screen readers and shown as a tooltip. */
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'primary' | 'danger';
  filled?: boolean;
}

/** Square icon-only button (table quick actions, toolbar). 40px touch target on mobile. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', tone = 'default', filled, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-container disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-9 w-9 md:h-8 md:w-8' : 'h-11 w-11 md:h-10 md:w-10',
        tone === 'default' && 'hover:text-on-surface',
        tone === 'primary' && 'hover:text-primary',
        tone === 'danger' && 'hover:text-error',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 22} filled={filled} />
    </button>
  );
});
