// Centralised runtime settings — reads from Vite env vars (browser) or process.env (Node/eval).
// Change thresholds here; never scatter magic numbers in logic files.

// ── Dual-mode env reader (Vite browser + Node.js tsx) ───────────────────────
const _viteEnv = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
const _nodeEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {};

function readEnv(key: string, fallback = ''): string {
  return _viteEnv[key] ?? _nodeEnv[key] ?? fallback;
}

// ── Thermal thresholds ────────────────────────────────────────────────────────

/** Temperature above which a thermal hotspot is flagged as a defect (°C). */
export const THERMAL_THRESHOLD_C = 70;

/**
 * Temperature band → severity mapping for thermal images.
 * Bands are [low, high) inclusive of low.
 */
export const THERMAL_SEVERITY_BANDS: Array<{ minC: number; maxC: number | null; severity: number }> = [
  { minC: 0,   maxC: 70,  severity: 0 },
  { minC: 70,  maxC: 80,  severity: 3 },
  { minC: 80,  maxC: 95,  severity: 4 },
  { minC: 95,  maxC: null, severity: 5 }, // null = infinity
];

/** Temperature readings outside this range are rejected as unrealistic.
 * Electrical equipment cannot have negative readings in a real hotspot scan.
 * Upper bound > 500°C is physically impossible for power line temperatures.
 */
export const THERMAL_TEMP_MIN = 0;
export const THERMAL_TEMP_MAX = 500;

/**
 * If `temp_source` is `colour_scale_estimate` and the temperature is within
 * this many °C of the threshold, verdict becomes NEEDS_REVIEW.
 */
export const THERMAL_ESTIMATE_MARGIN = 8;

/**
 * In double-check mode, if both calls return a numeric thermal temperature
 * and they differ by more than this, the readings are considered to disagree.
 */
export const THERMAL_DOUBLECHECK_MARGIN = 5;

// ── RGB confidence thresholds ─────────────────────────────────────────────────

/** Minimum confidence to include a finding (below → treated as NOT_VISIBLE). */
export const MIN_CONFIDENCE = 0.5;

/** Finding is kept but flagged as low-confidence (between MIN and this). */
export const LOW_CONFIDENCE = 0.7;

// ── Verdict thresholds ────────────────────────────────────────────────────────

/**
 * Minimum severity level to count as a "real defect" (DEFECT_FOUND verdict).
 * Components with 0 < severity < this give GOOD_MONITOR instead.
 * Default 2 means: severity 1 (Very Low) → GOOD_MONITOR, severity ≥ 2 → DEFECT_FOUND.
 */
export const SEVERITY_DEFECT_MIN = 2;

/**
 * Minimum number of visible components (healthy or monitor-only) required
 * to declare GOOD or GOOD_MONITOR. If fewer are visible → INCONCLUSIVE.
 */
export const MIN_COMPONENTS_FOR_GOOD = 3;

// ── Image quality thresholds ──────────────────────────────────────────────────

/** Minimum pixel length of shortest image side (hard fail below this). */
export const MIN_IMAGE_SIDE = 320;

/** Maximum file size in bytes accepted before upload (50 MB). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Laplacian variance threshold for blur detection.
 * Images with a score below this value trigger a blur warning.
 * Documented assumption: 80 was chosen empirically — lower = more blurry.
 * Typical sharp outdoor photos score > 200; very blurry ones < 50.
 * NOTE: blur warning is suppressed for thermal images (blur is expected/irrelevant).
 */
export const BLUR_WARN_THRESHOLD = 80;

/** Max longest side (px) before resizing the image before sending to Gemini. */
export const MAX_IMAGE_SIDE = 2048;

/** JPEG quality (0–1) used when re-encoding the resized image. */
export const JPEG_QUALITY = 0.9;

/** Gemini API call timeout in milliseconds. */
export const API_TIMEOUT_MS = 60_000;

// ── Read from environment ────────────────────────────────────────────────────

export const GEMINI_API_KEY = readEnv('VITE_GEMINI_API_KEY');
export const GEMINI_MODEL   = readEnv('VITE_GEMINI_MODEL', 'gemini-2.5-flash');
