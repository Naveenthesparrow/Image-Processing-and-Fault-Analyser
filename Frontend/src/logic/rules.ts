/**
 * Rule engine — converts validated Gemini observations into a Report.
 * Pure functions only: no side effects, no API calls.
 *
 * CRITICAL PRINCIPLE: Gemini reports observations. Our code decides the verdict.
 */

import {
  severityOf,
  isHealthy,
  COMPONENTS,
  ISSUES,
  type Component,
} from '../config/taxonomy';
import {
  MIN_CONFIDENCE,
  LOW_CONFIDENCE,
  MIN_COMPONENTS_FOR_GOOD,
  THERMAL_THRESHOLD_C,
  SEVERITY_DEFECT_MIN,
} from '../config/settings';
import type { GeminiResponse, ComponentObservation } from '../ai/schema';
import { runThermalRule, type ThermalResult } from './thermal';

// ── Output types ─────────────────────────────────────────────────────────────

export type Verdict =
  | 'GOOD'
  | 'GOOD_MONITOR'
  | 'DEFECT_FOUND'
  | 'INCONCLUSIVE'
  | 'INVALID'
  | 'NEEDS_REVIEW'
  | 'NEEDS_INPUT';

export type ComponentStatus =
  | 'HEALTHY'
  | 'DEFECT'
  | 'NOT_VISIBLE'
  | 'LOW_CONFIDENCE';

export interface ComponentResult {
  component: Component;
  status: ComponentStatus;
  issueType: string | null;
  severity: number;
  confidence: number;
  box2d: [number, number, number, number] | null;
  evidence: string;
  lowConfidenceFlag: boolean;
  notVisibleReason?: string;
}

export interface Report {
  verdict: Verdict;
  /** Overall severity (max across components, or thermal severity). */
  overallSeverity: number;
  imageType: 'rgb' | 'thermal' | 'invalid';
  components: ComponentResult[];
  /** Present for thermal images. */
  thermalResult?: ThermalResult;
  /** Human-readable summary built from template. */
  summary: string;
  /** Flags from image pre-check. */
  blurWarning: boolean;
  lowResWarning: boolean;
  /** When double-check mode found disagreement. */
  doubleCheckDisagreement?: boolean;
  /** If invalid, Gemini's stated reason. */
  invalidReason?: string;
}

// ── Image quality info (passed in from UI pre-checks) ───────────────────────

export interface ImageQualityInfo {
  blurWarning: boolean;
  lowResWarning: boolean;
}

// ── Rule engine ──────────────────────────────────────────────────────────────

export function buildReport(
  geminiOutput: GeminiResponse,
  quality: ImageQualityInfo,
  doubleCheckDisagreement = false,
  manualThermalTempC?: number
): Report {
  const { image_type, is_power_pole, components, thermal, invalid_reason } = geminiOutput;

  // ── INVALID branch ───────────────────────────────────────────────────────
  if (image_type === 'invalid' || !is_power_pole) {
    return {
      verdict: 'INVALID',
      overallSeverity: 0,
      imageType: image_type,
      components: emptyComponents(),
      summary: invalid_reason
        ? `Invalid image: ${invalid_reason}`
        : 'Image does not show a power pole or is unusable.',
      blurWarning: quality.blurWarning,
      lowResWarning: quality.lowResWarning,
      invalidReason: invalid_reason ?? undefined,
    };
  }

  // ── Double-check disagreement ────────────────────────────────────────────
  if (doubleCheckDisagreement) {
    const componentResults = processComponents(components);
    return {
      verdict: 'NEEDS_REVIEW',
      overallSeverity: maxSeverity(componentResults),
      imageType: image_type,
      components: componentResults,
      summary: 'Two analysis runs disagreed on the findings. A qualified inspector should review this image.',
      blurWarning: quality.blurWarning,
      lowResWarning: quality.lowResWarning,
      doubleCheckDisagreement: true,
    };
  }

  // ── Thermal branch ───────────────────────────────────────────────────────
  if (image_type === 'thermal') {
    const thermalResult = runThermalRule(thermal, manualThermalTempC);
    const componentResults = emptyComponents();

    let verdict: Verdict;
    switch (thermalResult.verdict) {
      case 'DEFECT_FOUND':    verdict = 'DEFECT_FOUND';  break;
      case 'NEEDS_REVIEW':    verdict = 'NEEDS_REVIEW';  break;
      case 'NEEDS_INPUT':     verdict = 'NEEDS_INPUT';   break;
      case 'GOOD_ESTIMATED':
      case 'GOOD':            verdict = 'GOOD';           break;
      default:                verdict = 'GOOD';
    }

    return {
      verdict,
      overallSeverity: thermalResult.severity,
      imageType: 'thermal',
      components: componentResults,
      thermalResult,
      summary: buildThermalSummary(thermalResult),
      blurWarning: false,
      lowResWarning: quality.lowResWarning,
    };
  }

  // ── RGB branch ───────────────────────────────────────────────────────────
  const componentResults = processComponents(components);
  const overallSeverity = maxSeverity(componentResults);
  const visibleHealthyOrMonitor = componentResults.filter(
    (c) => c.status === 'HEALTHY' || (c.status === 'DEFECT' && c.severity < SEVERITY_DEFECT_MIN)
  ).length;
  const hasDefect = componentResults.some((c) => c.status === 'DEFECT' && c.severity >= SEVERITY_DEFECT_MIN);
  const hasMonitorOnly = componentResults.some((c) => c.status === 'DEFECT' && c.severity > 0 && c.severity < SEVERITY_DEFECT_MIN);
  const hasLowConfidenceFlag = componentResults.some((c) => c.lowConfidenceFlag);

  let verdict: Verdict;
  if (hasDefect) {
    verdict = 'DEFECT_FOUND';
  } else if (
    visibleHealthyOrMonitor >= MIN_COMPONENTS_FOR_GOOD &&
    !quality.blurWarning &&
    !quality.lowResWarning &&
    !hasLowConfidenceFlag
  ) {
    verdict = hasMonitorOnly ? 'GOOD_MONITOR' : 'GOOD';
  } else {
    verdict = 'INCONCLUSIVE';
  }

  return {
    verdict,
    overallSeverity,
    imageType: 'rgb',
    components: componentResults,
    summary: buildRGBSummary(componentResults, verdict, quality),
    blurWarning: quality.blurWarning,
    lowResWarning: quality.lowResWarning,
    doubleCheckDisagreement,
  };
}

// ── Component processing helpers ─────────────────────────────────────────────

function processComponents(observations: ComponentObservation[]): ComponentResult[] {
  // Ensure all 5 components are present; fill missing ones
  const byComponent = new Map<string, ComponentObservation>();
  for (const obs of observations) {
    byComponent.set(obs.component, obs);
  }

  return COMPONENTS.map((comp) => {
    const obs = byComponent.get(comp);
    if (!obs) {
      return {
        component: comp,
        status: 'NOT_VISIBLE' as const,
        issueType: null,
        severity: 0,
        confidence: 0,
        box2d: null,
        evidence: '',
        lowConfidenceFlag: false,
        notVisibleReason: 'Component not reported by analysis.',
      };
    }

    return processObservation(obs);
  });
}

function processObservation(obs: ComponentObservation): ComponentResult {
  const base: Pick<ComponentResult, 'component' | 'confidence' | 'box2d' | 'evidence'> = {
    component: obs.component,
    confidence: obs.confidence,
    box2d: obs.box_2d as [number, number, number, number] | null ?? null,
    evidence: obs.evidence,
  };

  // Not visible
  if (!obs.visible) {
    return {
      ...base,
      status: 'NOT_VISIBLE',
      issueType: null,
      severity: 0,
      lowConfidenceFlag: false,
      notVisibleReason: undefined,
    };
  }

  // Below minimum confidence → treat as NOT_VISIBLE
  if (obs.confidence < MIN_CONFIDENCE) {
    return {
      ...base,
      status: 'NOT_VISIBLE',
      issueType: null,
      severity: 0,
      lowConfidenceFlag: false,
      notVisibleReason: 'unclear (low confidence)',
    };
  }

  const issueType = obs.issue_type ?? null;

  // Unknown issue type (safety guard — shouldn't happen with schema enums)
  const allowedIssues = ISSUES[obs.component] as readonly string[];
  if (!issueType || !allowedIssues.includes(issueType)) {
    return {
      ...base,
      status: 'NOT_VISIBLE',
      issueType: null,
      severity: 0,
      lowConfidenceFlag: false,
      notVisibleReason: 'unrecognised issue label',
    };
  }

  const severity = severityOf(issueType);
  const healthy = isHealthy(issueType);
  const lowConfidenceFlag = obs.confidence < LOW_CONFIDENCE;

  return {
    ...base,
    status: healthy ? 'HEALTHY' : 'DEFECT',
    issueType,
    severity,
    lowConfidenceFlag,
  };
}

// ── Fallback helper for non-component paths ──────────────────────────────────

function emptyComponents(): ComponentResult[] {
  return COMPONENTS.map((comp) => ({
    component: comp,
    status: 'NOT_VISIBLE' as const,
    issueType: null,
    severity: 0,
    confidence: 0,
    box2d: null,
    evidence: '',
    lowConfidenceFlag: false,
  }));
}

function maxSeverity(results: ComponentResult[]): number {
  return results.reduce((max, r) => Math.max(max, r.severity), 0);
}

// ── Summary builders ─────────────────────────────────────────────────────────

const ACTION_BY_SEVERITY: Record<number, string> = {
  0: 'No action required.',
  1: 'Monitor at next scheduled inspection.',
  2: 'Log and re-inspect within 3 months.',
  3: 'Schedule maintenance within 1 month.',
  4: 'Fix soon — prioritise within 2 weeks.',
  5: 'Urgent — take out of service immediately.',
};

function buildRGBSummary(
  results: ComponentResult[],
  verdict: Verdict,
  quality: ImageQualityInfo
): string {
  const lines: string[] = [];

  for (const r of results) {
    if (r.status === 'NOT_VISIBLE') {
      lines.push(`• ${capitalise(r.component)}: Not visible${r.notVisibleReason ? ` (${r.notVisibleReason})` : ''}.`);
    } else if (r.status === 'HEALTHY') {
      const issueFmt = r.issueType ? formatIssue(r.issueType) : 'healthy';
      const evidenceStr = r.evidence ? `\n  Reasoning: "${r.evidence}"` : '';
      lines.push(`• ${capitalise(r.component)}: ${issueFmt} — No issues detected.${evidenceStr}`);
    } else {
      const sev = r.severity;
      const action = ACTION_BY_SEVERITY[sev] ?? '';
      const evidenceStr = r.evidence ? `\n  Reasoning: "${r.evidence}"` : '';
      lines.push(
        `• ${capitalise(r.component)}: ${formatIssue(r.issueType ?? '')} — Severity ${sev}. ${action}${evidenceStr}`
      );
    }
  }

  if (verdict === 'INCONCLUSIVE') {
    const notVisible = results.filter((r) => r.status === 'NOT_VISIBLE').map((r) => r.component);
    lines.push(`\nVerdict: No defects seen in visible parts. Not visible: ${notVisible.join(', ') || 'none'}.`);
  } else if (verdict === 'GOOD_MONITOR') {
    lines.push(`\nVerdict: No defects, minor items to watch.`);
  }

  if (quality.blurWarning) lines.push('⚠ Image may be blurry — retake closer in daylight for better accuracy.');
  if (quality.lowResWarning) lines.push('⚠ Image resolution is low — tiny cracks may be missed.');

  return lines.join('\n');
}

function buildThermalSummary(t: ThermalResult): string {
  if (t.verdict === 'NEEDS_INPUT') {
    return t.rejectedReason
      ? `Temperature rejected: ${t.rejectedReason} Please enter the correct value.`
      : 'No temperature reading found in the image. Please enter the maximum temperature manually.';
  }
  const tempStr = t.tempC !== null ? `${t.tempC}°C` : 'unknown';
  const estimated = t.isEstimated ? ' (estimated from colour scale)' : '';
  if (t.verdict === 'DEFECT_FOUND') {
    return `Hotspot detected at ${tempStr}${estimated}, above the ${THERMAL_THRESHOLD_C}°C threshold. Severity ${t.severity}. Immediate inspection required.`;
  }
  if (t.verdict === 'NEEDS_REVIEW') {
    return `Temperature ${tempStr}${estimated} is within ±8°C of the threshold — borderline reading. A qualified inspector should confirm with a calibrated camera.`;
  }
  return `Temperature ${tempStr}${estimated} is within safe limits (threshold ${THERMAL_THRESHOLD_C}°C). No thermal anomaly detected.`;
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatIssue(s: string): string {
  return s.replace(/_/g, ' ');
}
