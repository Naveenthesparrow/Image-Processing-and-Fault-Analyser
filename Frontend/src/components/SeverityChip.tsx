import { labelOf } from '../config/taxonomy';

interface SeverityChipProps {
  severity: number;
  small?: boolean;
  /** If true, render as a badge with icon + text */
  badge?: boolean;
}

const SEVERITY_ICONS: Record<number, string> = {
  0: '✓',
  1: '↑',
  2: '!',
  3: '!!',
  4: '⚠',
  5: '✕',
};

export function SeverityChip({ severity, small, badge }: SeverityChipProps) {
  const meta = labelOf(severity);
  const icon = SEVERITY_ICONS[severity] ?? '?';

  if (badge) {
    return (
      <span
        className={`
          inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
          border bg-white shadow-sm whitespace-nowrap flex-shrink-0
          ${meta.text} ${meta.border}
        `}
        aria-label={`Severity ${severity}: ${meta.label}`}
      >
        <span aria-hidden="true">{icon}</span>
        {meta.label}
      </span>
    );
  }

  return (
    <span
      className={`
        inline-flex items-center justify-center rounded-md font-bold
        border bg-white shadow-sm whitespace-nowrap flex-shrink-0
        ${meta.text} ${meta.border}
        ${small ? 'px-2 py-0.5 text-[10px] uppercase tracking-wider' : 'px-3 py-1 text-sm'}
      `}
      aria-label={`Severity ${severity}: ${meta.label}`}
    >
      <span aria-hidden="true" className={small ? 'mr-1 text-[10px]' : 'mr-1'}>{icon}</span>
      {small ? `SEV ${severity}` : `Severity ${severity} — ${meta.label}`}
    </span>
  );
}
