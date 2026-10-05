import { z } from 'zod';
import { COMPONENTS } from '../config/taxonomy';

// ── Gemini responseSchema (passed to the API directly) ───────────────────────
// This is a JSON-Schema-style object that the Gemini SDK accepts verbatim.

const componentEnum = COMPONENTS as unknown as [string, ...string[]];


export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    image_type: {
      type: 'string',
      enum: ['rgb', 'thermal', 'invalid'],
      description: 'rgb = normal colour photo; thermal = false-colour heat image; invalid = not a power pole or unusable.',
    },
    invalid_reason: {
      type: 'string',
      nullable: true,
      description: 'Reason why image_type is invalid, or null.',
    },
    is_power_pole: {
      type: 'boolean',
      description: 'True if the image clearly shows a power pole or transmission structure.',
    },
    components: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          component: { type: 'string', enum: componentEnum },
          visible: { type: 'boolean' },
          issue_type: { type: 'string', nullable: true },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          box_2d: {
            type: 'array',
            nullable: true,
            items: { type: 'number' },
            minItems: 4,
            maxItems: 4,
            description: '[ymin, xmin, ymax, xmax] normalised 0–1000.',
          },
          evidence: { type: 'string' },
        },
        required: ['component', 'visible', 'confidence', 'evidence'],
      },
    },
    thermal: {
      type: 'object',
      properties: {
        max_temp_c: { type: 'number', nullable: true },
        temp_source: {
          type: 'string',
          enum: ['overlay_text', 'colour_scale_estimate', 'none'],
        },
        hotspot_box_2d: {
          type: 'array',
          nullable: true,
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
        },
        readable_temperatures_seen: { type: 'string' },
      },
      required: ['temp_source', 'readable_temperatures_seen'],
    },
  },
  required: ['image_type', 'is_power_pole', 'components', 'thermal'],
} as const;

// ── Zod schema (for validation on our side) ──────────────────────────────────

const Box2DSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .nullable()
  .optional();

// Validate box: ymin<ymax, xmin<xmax, all 0-1000
function isValidBox(box: [number, number, number, number] | null | undefined): boolean {
  if (!box) return true; // null/undefined is fine
  const [ymin, xmin, ymax, xmax] = box;
  return (
    ymin >= 0 && xmin >= 0 && ymax <= 1000 && xmax <= 1000 &&
    ymin < ymax && xmin < xmax
  );
}

const ComponentObservationSchema = z.object({
  component: z.enum(COMPONENTS),
  visible: z.boolean(),
  issue_type: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  box_2d: Box2DSchema,
  evidence: z.string(),
});

export const GeminiResponseSchema = z.object({
  image_type: z.enum(['rgb', 'thermal', 'invalid']),
  invalid_reason: z.string().nullable().optional(),
  is_power_pole: z.boolean(),
  components: z
    .array(ComponentObservationSchema)
    .length(5, 'Exactly 5 component entries required')
    .refine(
      (arr) => {
        const seen = new Set(arr.map((c) => c.component));
        return COMPONENTS.every((c) => seen.has(c));
      },
      { message: 'Must contain exactly one of each component (insulator, sag, structure, vegetation, conductor)' }
    ),
  thermal: z.object({
    max_temp_c: z.number().nullable().optional(),
    temp_source: z.enum(['overlay_text', 'colour_scale_estimate', 'none']),
    hotspot_box_2d: Box2DSchema,
    readable_temperatures_seen: z.string(),
  }),
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
export type ComponentObservation = z.infer<typeof ComponentObservationSchema>;

// Post-parse validation helpers

export function sanitiseBox(
  box: [number, number, number, number] | null | undefined
): [number, number, number, number] | null {
  if (!box) return null;
  return isValidBox(box) ? box : null;
}
