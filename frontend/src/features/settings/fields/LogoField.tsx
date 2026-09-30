/**
 * Logo picker: preview + upload / replace / remove. The file is read locally
 * into a data URL (small files only, since it is stored with the tenant
 * settings, which also means it works offline and in native shells).
 *
 * Shared by Settings › Institute profile and the setup wizard's Branding step.
 */
import { useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/store/uiStore';
import { initials } from '@/lib/format';

const MAX_LOGO_BYTES = 256 * 1024;

interface LogoFieldProps {
  /** Data URL (or remote URL) of the current logo; '' when there is none. */
  value: string;
  onChange: (dataUrl: string) => void;
  /** Institute name — used for the initials placeholder and alt text. */
  name: string;
  description?: string;
}

export function LogoField({
  value,
  onChange,
  name,
  description = 'Square image under 256 KB. Shown in the app header and on ID cards.',
}: LogoFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Choose an image file', description: 'PNG, JPG, SVG or WebP.', tone: 'error' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: 'Logo is too large', description: 'Use an image under 256 KB (square works best).', tone: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && onChange(reader.result);
    reader.onerror = () => toast({ title: 'Couldn’t read that file', tone: 'error' });
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-space-md">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-container-low">
        {value ? (
          <img src={value} alt={`${name || 'Institute'} logo`} className="h-full w-full object-contain p-1.5" />
        ) : (
          <span className="font-headline-sm text-headline-sm text-primary" aria-hidden>
            {initials(name || 'Institute')}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-space-xs">
        <div>
          <p className="font-label-lg text-label-lg text-on-surface">Logo</p>
          <p className="font-body-sm text-body-sm text-secondary">{description}</p>
        </div>
        <div className="flex flex-wrap gap-space-xs">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onFile} tabIndex={-1} aria-hidden />
          <Button variant="tonal" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
            {value ? 'Replace logo' : 'Upload logo'}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" icon="delete" onClick={() => onChange('')}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
