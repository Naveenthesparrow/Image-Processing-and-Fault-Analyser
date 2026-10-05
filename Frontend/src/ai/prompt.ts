/**
 * Prompt builder — generated entirely from taxonomy.ts so labels stay in sync.
 * PROMPT_VERSION bumped on every meaningful prompt change for eval tracking.
 */

import { COMPONENTS, ISSUES, COMPONENT_META } from '../config/taxonomy';

export const PROMPT_VERSION = '1.1.0';

/** Component plain-language definitions for the prompt. */
const COMPONENT_DEFINITIONS: Record<(typeof COMPONENTS)[number], string> = {
  insulator:  'ceramic or glass discs that electrically isolate the conductor from the pole',
  sag:        'the downward droop of the wire span between two poles; measured visually against the catenary curve',
  structure:  'the pole itself (wood, concrete, or steel) including its base and any visible foundation',
  vegetation: 'trees, branches, vines, or any plant growth in proximity to the line',
  conductor:  'the bare or covered wire(s) carrying electrical current along the line',
};

function buildComponentBlocks(): string {
  return COMPONENTS.map((comp) => {
    const issues = ISSUES[comp];
    const meta   = COMPONENT_META[comp];
    const def    = COMPONENT_DEFINITIONS[comp];
    const issueList = issues
      .map((iss, i) => `  ${i + 1}. ${iss}${i === 0 ? ' (healthy baseline)' : ''}`)
      .join('\n');
    return `### ${comp.toUpperCase()}\nDefinition: ${def}\nIcon: ${meta.icon}\nAllowed issue_type values (best → worst — use ONLY these exact strings):\n${issueList}`;
  }).join('\n\n');
}

function hintLine(imageTypeHint?: 'rgb' | 'thermal' | 'auto'): string {
  return imageTypeHint && imageTypeHint !== 'auto'
    ? `\nUser hint: the image type is "${imageTypeHint}". Use this as a strong prior but still confirm with visual evidence.\n`
    : '';
}

// ── First prompt (standard analysis) ────────────────────────────────────────

/** Build the main analysis prompt dynamically from taxonomy. */
export function buildPrompt(imageTypeHint?: 'rgb' | 'thermal' | 'auto'): string {
  return `
You are an electrical-line inspection assistant.
You report ONLY what is visibly evident in the image.
If you cannot clearly see a component, set visible=false.
Do NOT guess or hallucinate values.
${hintLine(imageTypeHint)}

## Step 1 — Classify the image

Decide image_type:
- "rgb"     → normal colour photograph of a power pole or transmission line
- "thermal" → false-colour heat / infrared image, typically showing a colour bar or temperature overlay
- "invalid" → not a power pole, or the image is unusable (solid colour, extreme blur, wrong subject)

Set is_power_pole = true only if a power pole or transmission structure is the primary subject.

## Step 2A — RGB image: inspect each component

For each of the 5 components below, produce one entry in the "components" array:

${buildComponentBlocks()}

Rules:
- Provide EXACTLY 5 entries, one per component, in the order: insulator, sag, structure, vegetation, conductor.
- visible=false → set issue_type=null, confidence=0, box_2d=null.
- If visible, choose the SINGLE WORST issue_type from the allowed list for THAT component only.
- box_2d: tight bounding box [ymin, xmin, ymax, xmax] normalised 0–1000. Only include when the component is clearly located.
- confidence 0–1: use lower values when the component is small, blurry, partially occluded, or far away.
- evidence: one short sentence of what you actually see that led to this label.
- SAG NOTE: sag from a single photo is very hard to judge. Only report sag if the full wire span between two poles is clearly visible and the droop is unambiguous. Otherwise, set visible=false.
- If a component has multiple problems, report the worst one only.

## Step 2B — Thermal image: temperature reading

For thermal images:
- Set ALL components to visible=false (thermal inspection uses temperature only).
- thermal.max_temp_c: read the maximum temperature ONLY if it is printed on the image (e.g. "Max 72.3 °C", spot meter overlay, scale top-end value). If only a colour scale is present, estimate the peak temperature and set temp_source="colour_scale_estimate". If nothing is readable, set max_temp_c=null and temp_source="none".
- NEVER invent a temperature value.
- hotspot_box_2d: tight box around the brightest/hottest area of the image.
- readable_temperatures_seen: list the actual text or values you found on the image.

## Output

Return valid JSON only — no markdown, no prose, no extra keys.
`.trim();
}

// ── Second prompt (independent verification — different wording) ─────────────

/**
 * Differently worded second prompt for double-check mode.
 * Independent reviewer framing encourages fresh analysis rather than
 * anchoring on patterns that triggered the first response.
 */
export function buildSecondPrompt(imageTypeHint?: 'rgb' | 'thermal' | 'auto'): string {
  const componentBlocks = COMPONENTS.map((comp) => {
    const issues = ISSUES[comp];
    const def    = COMPONENT_DEFINITIONS[comp];
    const list   = issues
      .map((iss, i) => `  • ${iss}${i === 0 ? ' — no defect' : ''}`)
      .join('\n');
    return `### ${comp.toUpperCase()}\n${def}\nCondition labels (best to worst — use ONLY these):\n${list}`;
  }).join('\n\n');

  return `
You are conducting an INDEPENDENT SECOND REVIEW of this power pole image.
Approach with completely fresh eyes. Do not assume any prior assessment.
Only report what you can directly observe — not what you expect to see.
When uncertain, choose visible=false rather than guessing.
${hintLine(imageTypeHint)}

## Classification
Is this image:
• "rgb" — standard visible-light photo of a power pole
• "thermal" — infrared heat-map with colour palette or temperature readings
• "invalid" — not usable (no pole visible, solid colour, corrupt, etc.)

is_power_pole: true only when a pole or transmission structure is the clear main subject.

## Component assessment (visible-light images)

Examine each of these 5 infrastructure elements independently:

${componentBlocks}

Instructions:
- Output exactly 5 entries in this order: insulator, sag, structure, vegetation, conductor.
- Not clearly visible → visible=false, issue_type=null, confidence=0, box_2d=null.
- Visible → single worst condition label from the list for THAT component only.
- box_2d: [ymin, xmin, ymax, xmax], values 0–1000. Be precise.
- confidence: your certainty 0–1. Be conservative for small or distant objects.
- evidence: exactly one sentence describing the physical feature that determined your label.
- Wire sag: only assess if the complete span between poles is visible. Otherwise: visible=false.

## Temperature reading (thermal images)

- All 5 component entries: visible=false.
- max_temp_c: extract ONLY values actually printed on the image. Estimate from colour scale if no number is shown (source="colour_scale_estimate"). If no temperature info at all, use null and source="none".
- Never fabricate temperatures.
- hotspot_box_2d: rectangle around the hottest visible region.
- readable_temperatures_seen: verbatim text you found.

Output JSON only. No markdown wrappers. No extra commentary.
`.trim();
}
