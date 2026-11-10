import { useId } from 'react';

/**
 * The ControlLayer mark: a lens with three blades, one for each part of the
 * CIA triad (confidentiality, integrity, availability), with a keyhole at the
 * center. Drawn on a 32x32 grid as one solid shape: the blade lines and the
 * keyhole are cut out with a mask, so the mark works on any background.
 *
 * The same geometry is used for the browser icon (src/app/icon.svg) and the
 * desktop icon (desktop/build/icon.svg); keep them in sync if this changes.
 */
export const LOGO_CUTS = 'M22.02 19.03L48.04 64.1M10.36 19.7L-41.68 19.7M15.62 9.27L41.63 -35.8';
export const LOGO_KEYHOLE_STEM = 'M14.57 15.56h2.86l1.43 6.8h-5.71Z';

export function LogoMark({ size = 28, className, color = 'currentColor' }: { size?: number; className?: string; color?: string }) {
  const id = `cl-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <circle cx="16" cy="16" r="14" fill="#fff" />
          <path d={LOGO_CUTS} stroke="#000" strokeWidth="2.1" fill="none" />
          <circle cx="16" cy="14.2" r="3.4" fill="#000" />
          <path d={LOGO_KEYHOLE_STEM} fill="#000" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect width="32" height="32" fill={color} mask={`url(#${id})`} />
    </svg>
  );
}

/** The mark next to the ControlLayer name, as used in the sidebar and sign-in screens. */
export function Wordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <LogoMark size={size} className="shrink-0 text-sky-400" />
      <span className="bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">ControlLayer</span>
    </span>
  );
}
