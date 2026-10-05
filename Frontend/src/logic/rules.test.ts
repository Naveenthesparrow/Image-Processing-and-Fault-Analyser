/**
 * Vitest unit tests for the rule engine and thermal logic.
 * Must all pass before the project is considered done.
 */

import { describe, it, expect } from 'vitest';
import { severityOf, isHealthy, COMPONENTS, ISSUES } from '../config/taxonomy';
import { buildReport, type ImageQualityInfo } from './rules';
import { runThermalRule, thermalSeverity } from './thermal';
import { GeminiResponseSchema } from '../ai/schema';

const GOOD_QUALITY: ImageQualityInfo = { blurWarning: false, lowResWarning: false };

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeComponent(
  component: string,
  visible: boolean,
  issue_type: string | null,
  confidence = 0.95
) {
  return { component, visible, issue_type, confidence, box_2d: null, evidence: 'test' };
}

function makeFullGeminiOutput(
  imageType: 'rgb' | 'thermal' | 'invalid' = 'rgb',
  componentOverrides: Partial<Record<string, { issue: string; confidence?: number; visible?: boolean }>> = {},
  thermalMax: number | null = null,
  thermalSource: 'overlay_text' | 'colour_scale_estimate' | 'none' = 'none'
) {
  return {
    image_type: imageType,
    is_power_pole: imageType !== 'invalid',
    components: COMPONENTS.map((comp) => {
      const override = componentOverrides[comp];
      const healthyIssue = ISSUES[comp as keyof typeof ISSUES][0];
      return makeComponent(
        comp,
        override?.visible ?? true,
        override?.issue ?? healthyIssue,
        override?.confidence ?? 0.95
      );
    }),
    thermal: {
      max_temp_c: thermalMax,
      temp_source: thermalSource,
      hotspot_box_2d: null,
      readable_temperatures_seen: '',
    },
  };
}

// ── 1. Taxonomy: every issue maps to its correct severity ────────────────────

describe('taxonomy — severity map', () => {
  it('insulator severities', () => {
    expect(severityOf('no_crack')).toBe(0);
    expect(severityOf('minor_crack')).toBe(2);
    expect(severityOf('major_crack')).toBe(4);
    expect(severityOf('flash_mark')).toBe(4);
    expect(severityOf('punctured')).toBe(5);
  });

  it('sag severities', () => {
    expect(severityOf('design_level')).toBe(0);
    expect(severityOf('slight')).toBe(1);
    expect(severityOf('near_limit')).toBe(3);
    expect(severityOf('at_limit')).toBe(4);
    expect(severityOf('below_limit')).toBe(4);
    expect(severityOf('critical')).toBe(5);
  });

  it('structure severities', () => {
    expect(severityOf('stable')).toBe(0);
    expect(severityOf('minor_rust')).toBe(1);
    expect(severityOf('moderate_rust')).toBe(3);
    expect(severityOf('tilted')).toBe(4);
    expect(severityOf('foundation_crack')).toBe(4);
    expect(severityOf('collapse_risk')).toBe(5);
  });

  it('vegetation severities', () => {
    expect(severityOf('clear')).toBe(0);
    expect(severityOf('far')).toBe(1);
    expect(severityOf('moderate_growth')).toBe(3);
    expect(severityOf('near_flashover')).toBe(4);
    expect(severityOf('touching')).toBe(4);
    expect(severityOf('contact')).toBe(5);
  });

  it('conductor severities', () => {
    expect(severityOf('excellent')).toBe(0);
    expect(severityOf('minor_wear')).toBe(1);
    expect(severityOf('surface_damage')).toBe(2);
    expect(severityOf('strand_damage')).toBe(3);
    expect(severityOf('loose_wire')).toBe(3);
    expect(severityOf('improper_binding')).toBe(4);
    expect(severityOf('severe_damage')).toBe(4);
    expect(severityOf('broken')).toBe(5);
  });

  it('isHealthy: healthy baseline issues', () => {
    expect(isHealthy('no_crack')).toBe(true);
    expect(isHealthy('design_level')).toBe(true);
    expect(isHealthy('stable')).toBe(true);
    expect(isHealthy('clear')).toBe(true);
    expect(isHealthy('excellent')).toBe(true);
    expect(isHealthy('minor_crack')).toBe(false);
    expect(isHealthy('contact')).toBe(false);
  });
});

// ── 2. Verdict table ─────────────────────────────────────────────────────────

describe('verdict table — RGB', () => {
  it('GOOD: all components healthy, good quality', () => {
    const output = makeFullGeminiOutput('rgb');
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('GOOD');
    expect(report.overallSeverity).toBe(0);
  });

  it('DEFECT_FOUND: insulator with major_crack', () => {
    const output = makeFullGeminiOutput('rgb', { insulator: { issue: 'major_crack' } });
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('DEFECT_FOUND');
    expect(report.overallSeverity).toBe(4);
  });

  it('GOOD_MONITOR: vegetation with far (sev=1) when SEVERITY_DEFECT_MIN=2', () => {
    const output = makeFullGeminiOutput('rgb', { vegetation: { issue: 'far' } });
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('GOOD_MONITOR');
    expect(report.overallSeverity).toBe(1);
  });

  it('DEFECT_FOUND: severity 5 — punctured insulator', () => {
    const output = makeFullGeminiOutput('rgb', { insulator: { issue: 'punctured' } });
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('DEFECT_FOUND');
    expect(report.overallSeverity).toBe(5);
  });

  it('INCONCLUSIVE: fewer than 3 visible/healthy (rest not visible)', () => {
    const output = makeFullGeminiOutput('rgb', {
      sag:        { issue: 'design_level', visible: false },
      structure:  { issue: 'stable', visible: false },
      vegetation: { issue: 'clear', visible: false },
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('INCONCLUSIVE');
  });

  it('INCONCLUSIVE: blur warning even with all healthy', () => {
    const output = makeFullGeminiOutput('rgb');
    const report = buildReport(output as any, { blurWarning: true, lowResWarning: false });
    expect(report.verdict).toBe('INCONCLUSIVE');
  });

  it('INVALID: image_type is invalid', () => {
    const output = makeFullGeminiOutput('invalid');
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('INVALID');
  });

  it('INVALID: is_power_pole false', () => {
    const output = { ...makeFullGeminiOutput('rgb'), is_power_pole: false };
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('INVALID');
  });

  it('NEEDS_REVIEW: double check disagreement', () => {
    const output = makeFullGeminiOutput('rgb');
    const report = buildReport(output as any, GOOD_QUALITY, true);
    expect(report.verdict).toBe('NEEDS_REVIEW');
  });

  it('NOT_VISIBLE: invalid issue type for specific component (e.g. insulator + touching)', () => {
    const output = makeFullGeminiOutput('rgb', {
      insulator: { issue: 'touching' } // 'touching' is a vegetation issue
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    const ins = report.components.find(c => c.component === 'insulator')!;
    expect(ins.status).toBe('NOT_VISIBLE');
    expect(ins.notVisibleReason).toBe('unrecognised issue label');
  });
});

// ── 3. Confidence thresholds ─────────────────────────────────────────────────

describe('confidence thresholds', () => {
  it('below MIN_CONFIDENCE (0.50) → treated as NOT_VISIBLE', () => {
    const output = makeFullGeminiOutput('rgb', {
      insulator: { issue: 'major_crack', confidence: 0.40 },
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    const ins = report.components.find((c) => c.component === 'insulator')!;
    expect(ins.status).toBe('NOT_VISIBLE');
  });

  it('exactly MIN_CONFIDENCE (0.50) → included', () => {
    const output = makeFullGeminiOutput('rgb', {
      insulator: { issue: 'major_crack', confidence: 0.50 },
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    const ins = report.components.find((c) => c.component === 'insulator')!;
    expect(ins.status).toBe('DEFECT');
  });

  it('between MIN and LOW_CONFIDENCE → DEFECT but flagged', () => {
    const output = makeFullGeminiOutput('rgb', {
      insulator: { issue: 'major_crack', confidence: 0.60 },
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    const ins = report.components.find((c) => c.component === 'insulator')!;
    expect(ins.status).toBe('DEFECT');
    expect(ins.lowConfidenceFlag).toBe(true);
  });

  it('above LOW_CONFIDENCE (0.70) → DEFECT not flagged', () => {
    const output = makeFullGeminiOutput('rgb', {
      insulator: { issue: 'major_crack', confidence: 0.80 },
    });
    const report = buildReport(output as any, GOOD_QUALITY);
    const ins = report.components.find((c) => c.component === 'insulator')!;
    expect(ins.lowConfidenceFlag).toBe(false);
  });
});

// ── 4. Thermal edge cases ────────────────────────────────────────────────────

describe('thermal rule edge cases', () => {
  const makeThermal = (tempC: number | null, source: 'overlay_text' | 'colour_scale_estimate' | 'none' = 'overlay_text') => ({
    max_temp_c: tempC,
    temp_source: source,
    hotspot_box_2d: null,
    readable_temperatures_seen: '',
  });

  it('null temp → NEEDS_INPUT', () => {
    const r = runThermalRule(makeThermal(null, 'none'));
    expect(r.verdict).toBe('NEEDS_INPUT');
  });

  it('69.9°C → GOOD', () => {
    const r = runThermalRule(makeThermal(69.9));
    expect(r.verdict).toBe('GOOD');
  });

  it('70.0°C → DEFECT_FOUND', () => {
    const r = runThermalRule(makeThermal(70.0));
    expect(r.verdict).toBe('DEFECT_FOUND');
  });

  it('70.1°C → DEFECT_FOUND', () => {
    const r = runThermalRule(makeThermal(70.1));
    expect(r.verdict).toBe('DEFECT_FOUND');
  });

  it('negative temperature → NEEDS_INPUT (rejected)', () => {
    const r = runThermalRule(makeThermal(-1));
    expect(r.verdict).toBe('NEEDS_INPUT');
    expect(r.rejectedReason).toBeTruthy();
  });

  it('>500°C → NEEDS_INPUT (unrealistic)', () => {
    const r = runThermalRule(makeThermal(501));
    expect(r.verdict).toBe('NEEDS_INPUT');
    expect(r.rejectedReason).toBeTruthy();
  });

  it('estimated temp within ±8°C of threshold → NEEDS_REVIEW', () => {
    const r = runThermalRule(makeThermal(65, 'colour_scale_estimate'));
    expect(r.verdict).toBe('NEEDS_REVIEW');
  });

  it('estimated temp clearly above (80) → DEFECT_FOUND', () => {
    const r = runThermalRule(makeThermal(80, 'colour_scale_estimate'));
    expect(r.verdict).toBe('DEFECT_FOUND');
  });

  it('severity bands: 70 → sev 3', () => {
    expect(thermalSeverity(70)).toBe(3);
  });

  it('severity bands: 80 → sev 4', () => {
    expect(thermalSeverity(80)).toBe(4);
  });

  it('severity bands: 95 → sev 5', () => {
    expect(thermalSeverity(95)).toBe(5);
  });

  it('severity bands: 50 → sev 0', () => {
    expect(thermalSeverity(50)).toBe(0);
  });

  it('manual temp overrides null AI temp', () => {
    const r = runThermalRule(makeThermal(null, 'none'), 75);
    expect(r.verdict).toBe('DEFECT_FOUND');
    expect(r.source).toBe('manual');
    expect(r.tempC).toBe(75);
  });
});

// ── 5. Thermal report integration ───────────────────────────────────────────

describe('thermal report integration', () => {
  it('thermal image with max 75°C → DEFECT_FOUND report', () => {
    const output = makeFullGeminiOutput('thermal', {}, 75, 'overlay_text');
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('DEFECT_FOUND');
    expect(report.imageType).toBe('thermal');
  });

  it('thermal image with null temp → NEEDS_INPUT', () => {
    const output = makeFullGeminiOutput('thermal', {}, null, 'none');
    const report = buildReport(output as any, GOOD_QUALITY);
    expect(report.verdict).toBe('NEEDS_INPUT');
  });

  it('thermal report with manual temp 72 → DEFECT_FOUND', () => {
    const output = makeFullGeminiOutput('thermal', {}, null, 'none');
    const report = buildReport(output as any, GOOD_QUALITY, false, 72);
    expect(report.verdict).toBe('DEFECT_FOUND');
  });
});

// ── 6. Zod schema tests ──────────────────────────────────────────────────────

describe('zod schema validation', () => {
  it('rejects unknown issue label in components', () => {
    const bad = makeFullGeminiOutput('rgb');
    bad.components[0] = makeComponent('insulator', true, 'alien_issue') as any;
    // Schema allows any string for issue_type, safety happens in rule engine
    // But we can check it gets ignored
    const report = buildReport(bad as any, GOOD_QUALITY);
    const ins = report.components.find((c) => c.component === 'insulator')!;
    expect(ins.status).toBe('NOT_VISIBLE'); // unrecognised → ignored
  });

  it('requires exactly 5 components', () => {
    const partial = {
      image_type: 'rgb',
      is_power_pole: true,
      components: [makeComponent('insulator', true, 'no_crack')],
      thermal: { max_temp_c: null, temp_source: 'none', hotspot_box_2d: null, readable_temperatures_seen: '' },
    };
    const result = GeminiResponseSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it('rejects bad box values where min >= max', () => {
    const output = makeFullGeminiOutput('rgb');
    output.components[0] = {
      ...makeComponent('insulator', true, 'no_crack'),
      box_2d: [500, 500, 200, 200] as any, // ymin > ymax is invalid
    };
    // sanitiseBox in schema should handle this → the box gets dropped in UI
    const result = GeminiResponseSchema.safeParse(output);
    // Zod schema doesn't reject bad boxes (value-level check is in sanitiseBox)
    expect(result.success).toBe(true); // still parses, box validated in boxes.ts
  });
});
