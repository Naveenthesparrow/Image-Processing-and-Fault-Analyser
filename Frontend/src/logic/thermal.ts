/**
 * Thermal-specific rule logic, extracted for clarity and testability.
 */

import {
  THERMAL_THRESHOLD_C,
  THERMAL_SEVERITY_BANDS,
  THERMAL_TEMP_MIN,
  THERMAL_TEMP_MAX,
  THERMAL_ESTIMATE_MARGIN,
} from '../config/settings';
import type { GeminiResponse } from '../ai/schema';

export type ThermalVerdict =
  | 'GOOD'
  | 'GOOD_ESTIMATED'
  | 'DEFECT_FOUND'
  | 'NEEDS_REVIEW'
  | 'NEEDS_INPUT';

export interface ThermalResult {
  verdict: ThermalVerdict;
  severity: number;
  tempC: number | null;
  source: 'overlay_text' | 'colour_scale_estimate' | 'none' | 'manual';
  isEstimated: boolean;
  /** Present when the reading was rejected as unrealistic. */
  rejectedReason?: string;
}

/**
 * Compute severity band for a temperature reading.
 */
export function thermalSeverity(tempC: number): number {
  for (const band of THERMAL_SEVERITY_BANDS) {
    if (tempC >= band.minC && (band.maxC === null || tempC < band.maxC)) {
      return band.severity;
    }
  }
  return 0;
}

/**
 * Run the thermal rule given Gemini's thermal output and an optional
 * manually entered temperature (from the UI input box).
 */
export function runThermalRule(
  thermal: GeminiResponse['thermal'],
  manualTempC?: number
): ThermalResult {
  // Prefer manual entry if provided
  const tempC = manualTempC ?? thermal.max_temp_c ?? null;
  const source = manualTempC !== undefined
    ? 'manual'
    : thermal.temp_source;

  // No temperature available
  if (tempC === null) {
    return { verdict: 'NEEDS_INPUT', severity: 0, tempC: null, source, isEstimated: false };
  }

  // Reject unrealistic values
  if (tempC < THERMAL_TEMP_MIN || tempC > THERMAL_TEMP_MAX) {
    return {
      verdict: 'NEEDS_INPUT',
      severity: 0,
      tempC: null,
      source,
      isEstimated: false,
      rejectedReason: `${tempC}°C is outside the realistic range (${THERMAL_TEMP_MIN}–${THERMAL_TEMP_MAX}°C).`,
    };
  }

  const isEstimated = source === 'colour_scale_estimate';
  const sev = thermalSeverity(tempC);

  // Within margin of threshold when estimated → NEEDS_REVIEW
  if (isEstimated && Math.abs(tempC - THERMAL_THRESHOLD_C) <= THERMAL_ESTIMATE_MARGIN) {
    return { verdict: 'NEEDS_REVIEW', severity: sev, tempC, source, isEstimated };
  }

  if (tempC >= THERMAL_THRESHOLD_C) {
    return { verdict: 'DEFECT_FOUND', severity: sev, tempC, source, isEstimated };
  }

  // Below threshold
  return {
    verdict: isEstimated ? 'GOOD_ESTIMATED' : 'GOOD',
    severity: 0,
    tempC,
    source,
    isEstimated,
  };
}
