import {
  Zap, ArrowDown, Building2, Leaf, Cable,
  EyeOff, AlertTriangle, Info
} from 'lucide-react';
import type { ComponentResult } from '../logic/rules';
import { labelOf, COMPONENT_META } from '../config/taxonomy';
import { SeverityChip } from './SeverityChip';

const ICONS: Record<string, React.ReactNode> = {
  Zap:      <Zap size={20} aria-hidden="true" />,
  ArrowDown:<ArrowDown size={20} aria-hidden="true" />,
  Building2:<Building2 size={20} aria-hidden="true" />,
  Leaf:     <Leaf size={20} aria-hidden="true" />,
  Cable:    <Cable size={20} aria-hidden="true" />,
};

interface ComponentCardProps {
  result: ComponentResult;
}

const STATUS_LABELS: Record<string, string> = {
  HEALTHY:        'Healthy',
  DEFECT:         'Defect detected',
  NOT_VISIBLE:    'Not visible',
  LOW_CONFIDENCE: 'Low confidence',
};

export function ComponentCard({ result }: ComponentCardProps) {
  const meta   = COMPONENT_META[result.component];
  const icon   = ICONS[meta.icon];
  const sev    = result.severity;
  const sevMeta = labelOf(sev);

  const isDefect   = result.status === 'DEFECT';
  const isHealthy  = result.status === 'HEALTHY';
  const notVisible = result.status === 'NOT_VISIBLE';

  return (
    <article
      className={`
        group relative flex flex-col p-5 rounded-xl border border-slate-200 bg-white
        transition-all duration-300 hover:shadow-md hover:border-slate-300
        ${notVisible ? 'opacity-70' : ''}
      `}
      aria-label={`${result.component} component: ${STATUS_LABELS[result.status]}`}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className={`
          flex-shrink-0 p-2 rounded-xl border shadow-sm
          ${isDefect ? 'bg-red-50 border-red-100 text-red-600' : isHealthy ? 'bg-green-50 border-green-100 text-green-600' : 'bg-slate-50 border-slate-100 text-slate-400'}
        `}>
          {icon}
        </div>
        
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 capitalize text-[15px] leading-tight truncate">
            {result.component}
          </h3>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
            {STATUS_LABELS[result.status]}
            {result.notVisibleReason && ` — ${result.notVisibleReason}`}
          </p>
        </div>

        {/* Severity chip */}
        {!notVisible && (
          <div className="flex-shrink-0">
            <SeverityChip severity={sev} small />
          </div>
        )}
        {notVisible && (
          <div className="flex-shrink-0 mt-1">
            <span className="text-slate-300" aria-label="Not visible">
              <EyeOff size={16} aria-hidden="true" />
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 flex-1">
        {/* Issue type */}
        {result.issueType && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border shadow-sm capitalize whitespace-nowrap ${isDefect ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              {isDefect && <AlertTriangle size={12} aria-hidden="true" />}
              {result.issueType.replace(/_/g, ' ')}
            </span>
            {result.lowConfidenceFlag && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                Low Conf
              </span>
            )}
          </div>
        )}

        {/* Evidence */}
        {result.evidence && result.status !== 'NOT_VISIBLE' && (
          <p className="text-xs text-slate-600 leading-relaxed italic flex-1">
            "{result.evidence}"
          </p>
        )}

        {/* Confidence bar */}
        {result.status !== 'NOT_VISIBLE' && (
          <div className="mt-auto pt-1">
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
              <span className="flex items-center gap-1 cursor-help" title="How certain the AI is about its observation. Below 60% indicates blurry, distant, or obstructed views.">
                Confidence
                <Info size={11} aria-hidden="true" />
              </span>
              <span>{(result.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden" role="progressbar" aria-valuenow={Math.round(result.confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Confidence ${Math.round(result.confidence * 100)}%`}>
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isDefect ? sevMeta.colour : 'bg-green-500'
                }`}
                style={{ width: `${result.confidence * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
