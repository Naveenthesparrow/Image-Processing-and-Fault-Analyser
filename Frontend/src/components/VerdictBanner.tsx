import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Eye,
} from 'lucide-react';
import type { Verdict } from '../logic/rules';
import type { ComponentResult } from '../logic/rules';
import { labelOf } from '../config/taxonomy';

interface VerdictConfig {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  bg: string;
  border: string;
  textClass: string;
}

const VERDICT_CONFIG: Record<Verdict, VerdictConfig> = {
  GOOD: {
    icon: <CheckCircle2 size={32} aria-hidden="true" />,
    label: 'ALL CLEAR',
    sublabel: 'No defects detected — pole is in good condition',
    bg: 'bg-green-50',
    border: 'border-green-200',
    textClass: 'text-green-700',
  },
  DEFECT_FOUND: {
    icon: <AlertTriangle size={32} aria-hidden="true" />,
    label: 'DEFECT FOUND',
    sublabel: 'One or more components require attention',
    bg: 'bg-red-50',
    border: 'border-red-200',
    textClass: 'text-red-700',
  },
  GOOD_MONITOR: {
    icon: <CheckCircle2 size={32} aria-hidden="true" />,
    label: 'GOOD — MONITOR',
    sublabel: 'No critical defects, minor items to watch',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    textClass: 'text-teal-700',
  },
  INCONCLUSIVE: {
    icon: <HelpCircle size={32} aria-hidden="true" />,
    label: 'INCONCLUSIVE',
    sublabel: 'Limited visibility — not enough data for a clear verdict',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    textClass: 'text-slate-700',
  },
  INVALID: {
    icon: <XCircle size={32} aria-hidden="true" />,
    label: 'INVALID IMAGE',
    sublabel: 'Not a power pole or unusable image',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    textClass: 'text-slate-500',
  },
  NEEDS_REVIEW: {
    icon: <Eye size={32} aria-hidden="true" />,
    label: 'NEEDS REVIEW',
    sublabel: 'Human verification recommended',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    textClass: 'text-purple-700',
  },
  NEEDS_INPUT: {
    icon: <HelpCircle size={32} aria-hidden="true" />,
    label: 'NEEDS INPUT',
    sublabel: 'Additional information required',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    textClass: 'text-amber-700',
  },
};

const SEVERITY_COLOURS: Record<number, string> = {
  0: 'text-slate-500',
  1: 'text-green-600',
  2: 'text-teal-600',
  3: 'text-yellow-600',
  4: 'text-orange-600',
  5: 'text-red-600',
};

const SEVERITY_BG: Record<number, string> = {
  0: 'bg-slate-50 border-slate-200',
  1: 'bg-green-50 border-green-200',
  2: 'bg-teal-50 border-teal-200',
  3: 'bg-yellow-50 border-yellow-200',
  4: 'bg-orange-50 border-orange-200',
  5: 'bg-red-50 border-red-200',
};

interface VerdictBannerProps {
  verdict: Verdict;
  overallSeverity: number;
  severityLabel?: string;
  components: ComponentResult[];
}

export function VerdictBanner({
  verdict,
  overallSeverity,
  severityLabel,
  components,
}: VerdictBannerProps) {
  const cfg = VERDICT_CONFIG[verdict];

  const defects = components.filter(
    (c) => c.status === 'DEFECT' && c.severity >= 1
  ).sort((a, b) => b.severity - a.severity);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Verdict: ${cfg.label}`}
      className={`
        relative overflow-hidden rounded-2xl border px-6 py-5
        ${cfg.bg} ${cfg.border}
        shadow-sm transition-all duration-700
      `}
    >
      {/* Pulse ring for high severity */}
      {verdict === 'DEFECT_FOUND' && overallSeverity >= 4 && (
        <div className="absolute inset-0 rounded-2xl border-2 border-red-500/30 animate-pulse" aria-hidden="true" />
      )}

      <div className="relative flex flex-col gap-4">
        {/* Top row: icon + title + severity */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={`p-3 rounded-xl bg-white border border-white/60 shadow-sm ${cfg.textClass} flex-shrink-0`}>
            {cfg.icon}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${cfg.textClass}`}>
              {cfg.label}
            </h2>
            <p className={`mt-0.5 text-sm font-medium ${cfg.textClass} opacity-80`}>{cfg.sublabel}</p>
          </div>

          {verdict === 'DEFECT_FOUND' && severityLabel && (
            <div className="flex-shrink-0 flex flex-col items-center px-6 py-3 rounded-xl bg-white border border-white/60 shadow-sm">
              <span className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${cfg.textClass} opacity-70`}>Overall Severity</span>
              <span className={`text-3xl font-black ${cfg.textClass}`}>{overallSeverity}</span>
              <span className={`text-xs font-bold ${cfg.textClass}`}>{severityLabel}</span>
            </div>
          )}
        </div>

        {/* Defect breakdown list */}
        {verdict === 'DEFECT_FOUND' && defects.length > 0 && (
          <div className={`border-t border-red-200/50 pt-4`}>
            <p className={`text-xs font-bold ${cfg.textClass} opacity-80 uppercase tracking-widest mb-3`}>Issues Detected</p>
            <div className="flex flex-wrap gap-2">
              {defects.map((c) => (
                <div
                  key={c.component}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold bg-white shadow-sm ${SEVERITY_BG[c.severity]}`}
                >
                  <AlertTriangle size={12} className={SEVERITY_COLOURS[c.severity]} aria-hidden="true" />
                  <span className="text-slate-700 capitalize">{c.component}</span>
                  <span className="text-slate-300">—</span>
                  <span className="text-slate-600 capitalize">{(c.issueType ?? '').replace(/_/g, ' ')}</span>
                  <span className={`ml-1 font-black ${SEVERITY_COLOURS[c.severity]}`}>
                    S{c.severity}
                  </span>
                  <span className={`${SEVERITY_COLOURS[c.severity]} opacity-80`}>
                    {labelOf(c.severity).label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
