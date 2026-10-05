// Single source of truth for all component/issue labels and severity scores.
// ALL label strings in the app must come from here — never hardcode elsewhere.

export const COMPONENTS = [
  'insulator',
  'sag',
  'structure',
  'vegetation',
  'conductor',
] as const;

export type Component = (typeof COMPONENTS)[number];

// ── Issue types per component (best → worst) ────────────────────────────────

export const ISSUES = {
  insulator: [
    'no_crack',
    'minor_crack',
    'major_crack',
    'flash_mark',
    'punctured',
  ],
  sag: [
    'design_level',
    'slight',
    'near_limit',
    'at_limit',
    'below_limit',
    'critical',
  ],
  structure: [
    'stable',
    'minor_rust',
    'moderate_rust',
    'tilted',
    'foundation_crack',
    'collapse_risk',
  ],
  vegetation: [
    'clear',
    'far',
    'moderate_growth',
    'near_flashover',
    'touching',
    'contact',
  ],
  conductor: [
    'excellent',
    'minor_wear',
    'surface_damage',
    'strand_damage',
    'loose_wire',
    'improper_binding',
    'severe_damage',
    'broken',
  ],
} as const satisfies Record<Component, readonly string[]>;

export type IssueType = (typeof ISSUES)[Component][number];

// Flat union of all issue strings across all components
export type AnyIssueType =
  | (typeof ISSUES)['insulator'][number]
  | (typeof ISSUES)['sag'][number]
  | (typeof ISSUES)['structure'][number]
  | (typeof ISSUES)['vegetation'][number]
  | (typeof ISSUES)['conductor'][number];

// ── Healthy (severity 0) flags ───────────────────────────────────────────────

const HEALTHY_ISSUES = new Set<string>([
  'no_crack',
  'design_level',
  'stable',
  'clear',
  'excellent',
]);

export function isHealthy(issue: string): boolean {
  return HEALTHY_ISSUES.has(issue);
}

// ── Severity map (CONFIG — edit here to change thresholds) ──────────────────

const SEVERITY_MAP: Record<string, number> = {
  // insulator
  no_crack: 0,
  minor_crack: 2,
  major_crack: 4,
  flash_mark: 4,
  punctured: 5,
  // sag
  design_level: 0,
  slight: 1,
  near_limit: 3,
  at_limit: 4,
  below_limit: 4,
  critical: 5,
  // structure
  stable: 0,
  minor_rust: 1,
  moderate_rust: 3,
  tilted: 4,
  foundation_crack: 4,
  collapse_risk: 5,
  // vegetation
  clear: 0,
  far: 1,
  moderate_growth: 3,
  near_flashover: 4,
  touching: 4,
  contact: 5,
  // conductor
  excellent: 0,
  minor_wear: 1,
  surface_damage: 2,
  strand_damage: 3,
  loose_wire: 3,
  improper_binding: 4,
  severe_damage: 4,
  broken: 5,
};

export function severityOf(issue: string): number {
  return SEVERITY_MAP[issue] ?? -1; // -1 = unknown issue
}

// ── Severity label & colour ──────────────────────────────────────────────────

export interface SeverityMeta {
  label: string;
  colour: string;   // Tailwind bg class
  text: string;     // Tailwind text class
  border: string;   // Tailwind border class
}

export const SEVERITY_META: Record<number, SeverityMeta> = {
  0: { label: 'No Issues',  colour: 'bg-blue-500',   text: 'text-blue-600',   border: 'border-blue-200' },
  1: { label: 'Very Low',   colour: 'bg-green-500',  text: 'text-green-600',  border: 'border-green-200' },
  2: { label: 'Low',        colour: 'bg-teal-500',   text: 'text-teal-600',   border: 'border-teal-200' },
  3: { label: 'Medium',     colour: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-300' },
  4: { label: 'High',       colour: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-300' },
  5: { label: 'Critical',   colour: 'bg-red-600',    text: 'text-red-600',    border: 'border-red-200' },
};

export function labelOf(sev: number): SeverityMeta {
  return SEVERITY_META[sev] ?? SEVERITY_META[0];
}

// ── Component icons (Lucide icon names) ─────────────────────────────────────

export const COMPONENT_META: Record<Component, { icon: string; description: string }> = {
  insulator: {
    icon: 'Zap',
    description: 'Ceramic or glass discs that electrically isolate the wire from the pole.',
  },
  sag: {
    icon: 'ArrowDown',
    description: 'The droop of the wire span between poles; must stay within safe limits.',
  },
  structure: {
    icon: 'Building2',
    description: 'The pole itself: concrete, wood, or steel; includes base and foundation.',
  },
  vegetation: {
    icon: 'Leaf',
    description: 'Trees and plants growing near the line that can cause flashover or fire.',
  },
  conductor: {
    icon: 'Cable',
    description: 'The bare or covered wire carrying electricity along the line.',
  },
};

// Flat set of all valid issue strings (useful for runtime safety checks)
export const ALL_ISSUES = new Set<string>(Object.values(ISSUES).flat());
