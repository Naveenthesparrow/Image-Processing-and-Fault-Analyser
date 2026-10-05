import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Eye,
  Thermometer,
  Zap,
} from 'lucide-react';
import type { Verdict } from '../logic/rules';

interface VerdictConfig {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  gradient: string;
  border: string;
  glow: string;
  textClass: string;
}

const VERDICT_CONFIG: Record<Verdict, VerdictConfig> = {
  GOOD: {
    icon: <CheckCircle2 size={36} aria-hidden="true" />,
    label: 'GOOD',
    sublabel: 'No defects detected',
    gradient: 'from-green-50 to-white',
    border: 'border-green-200',
    glow: 'shadow-sm',
    textClass: 'text-green-700',
  },
  DEFECT_FOUND: {
    icon: <AlertTriangle size={36} aria-hidden="true" />,
    label: 'DEFECT FOUND',
    sublabel: 'Inspection action required',
    gradient: 'from-orange-50 to-white',
    border: 'border-orange-200',
    glow: 'shadow-sm',
    textClass: 'text-orange-700',
  },
  GOOD_MONITOR: {
    icon: <CheckCircle2 size={36} aria-hidden="true" />,
    label: 'GOOD (MONITOR)',
    sublabel: 'No defects, minor items to watch',
    gradient: 'from-teal-50 to-white',
    border: 'border-teal-200',
    glow: 'shadow-sm',
    textClass: 'text-teal-700',
  },
  INCONCLUSIVE: {
    icon: <HelpCircle size={36} aria-hidden="true" />,
    label: 'INCONCLUSIVE',
    sublabel: 'Limited visibility — not enough data for a clear verdict',
    gradient: 'from-slate-100 to-white',
    border: 'border-slate-300',
    glow: 'shadow-sm',
    textClass: 'text-slate-700',
  },
  INVALID: {
    icon: <XCircle size={36} aria-hidden="true" />,
    label: 'INVALID IMAGE',
    sublabel: 'Not a power pole or unusable image',
    gradient: 'from-red-50 to-white',
    border: 'border-red-200',
    glow: 'shadow-sm',
    textClass: 'text-red-700',
  },
  NEEDS_REVIEW: {
    icon: <Eye size={36} aria-hidden="true" />,
    label: 'NEEDS REVIEW',
    sublabel: 'Human verification recommended',
    gradient: 'from-purple-50 to-white',
    border: 'border-purple-200',
    glow: 'shadow-sm',
    textClass: 'text-purple-700',
  },
  NEEDS_INPUT: {
    icon: <Thermometer size={36} aria-hidden="true" />,
    label: 'NEEDS INPUT',
    sublabel: 'Enter thermal temperature to complete analysis',
    gradient: 'from-amber-50 to-white',
    border: 'border-amber-200',
    glow: 'shadow-sm',
    textClass: 'text-amber-700',
  },
};

interface VerdictBannerProps {
  verdict: Verdict;
  overallSeverity: number;
  severityLabel?: string;
  imageType: 'rgb' | 'thermal' | 'invalid';
  isEstimated?: boolean;
}

export function VerdictBanner({
  verdict,
  overallSeverity,
  severityLabel,
  imageType,
  isEstimated,
}: VerdictBannerProps) {
  const cfg = VERDICT_CONFIG[verdict];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Verdict: ${cfg.label}`}
      className={`
        relative overflow-hidden rounded-2xl border px-6 py-6
        bg-gradient-to-br ${cfg.gradient} ${cfg.border}
        shadow-2xl ${cfg.glow}
        transition-all duration-700
      `}
    >
      {/* Background pulse for defects */}
      {verdict === 'DEFECT_FOUND' && overallSeverity >= 4 && (
        <div className="absolute inset-0 rounded-2xl border border-red-500/30 animate-pulse" aria-hidden="true" />
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon */}
        <div className={`p-3 rounded-xl bg-white shadow-sm border border-slate-100 ${cfg.textClass}`}>
          {cfg.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${cfg.textClass}`}>
              {cfg.label}
            </h2>
            {isEstimated && (
              <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold shadow-sm">
                Estimated
              </span>
            )}
            {imageType !== 'invalid' && (
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-sm">
                <Zap size={10} aria-hidden="true" />
                {imageType === 'thermal' ? 'Thermal' : 'RGB'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">{cfg.sublabel}</p>
        </div>

        {/* Severity badge */}
        {verdict === 'DEFECT_FOUND' && severityLabel && (
          <div className="flex-shrink-0 flex flex-col items-center px-6 py-3 rounded-xl bg-white border border-slate-300 shadow-sm">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Severity</span>
            <span className={`text-3xl font-black ${cfg.textClass}`}>{overallSeverity}</span>
            <span className={`text-xs font-bold ${cfg.textClass}`}>{severityLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
