import {
  GoogleGenAI,
  type GenerateContentResponse,
} from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, API_TIMEOUT_MS, MAX_IMAGE_SIDE, JPEG_QUALITY } from '../config/settings';
import { GEMINI_RESPONSE_SCHEMA, GeminiResponseSchema, type GeminiResponse } from './schema';
import { buildPrompt, buildSecondPrompt } from './prompt';
import { resizeImage, imageToBase64 } from '../utils/image';

// ── Types ────────────────────────────────────────────────────────────────────

export type ImageTypeHint = 'auto' | 'rgb' | 'thermal';

export interface AnalyseResult {
  data: GeminiResponse;
  doubleCheckDisagreement?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set. Add it to your .env file.');
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

async function callGemini(
  client: GoogleGenAI,
  base64: string,
  mimeType: string,
  hint: ImageTypeHint,
  previousError?: string,
  useSecondPrompt = false
): Promise<GeminiResponse> {
  const model = GEMINI_MODEL;
  if (!model) throw new Error('VITE_GEMINI_MODEL is not set.');

  const promptFunc = useSecondPrompt ? buildSecondPrompt : buildPrompt;
  const promptText = promptFunc(hint === 'auto' ? undefined : hint) +
    (previousError ? `\n\n[RETRY NOTE: previous attempt returned invalid JSON. Error: ${previousError}]` : '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: GenerateContentResponse;
  try {
    response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA as never,
      },
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = response.text ?? '';

  // Parse and validate with Zod
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const result = GeminiResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`);
  }
  return result.data;
}

async function preFlightCheck(
  client: GoogleGenAI,
  base64: string,
  mimeType: string
): Promise<boolean> {
  const model = GEMINI_MODEL;
  if (!model) throw new Error('VITE_GEMINI_MODEL is not set.');

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Look closely at this image. Is it a photograph of a power pole, transmission tower, electrical insulator, or closely related electrical grid infrastructure? Return true if it is, and false if it is a random irrelevant photo (e.g., a person, a cat, an indoor room, a car).' },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { is_power_pole: { type: 'boolean' } },
          required: ['is_power_pole'],
        } as never,
      },
    });

    const raw = response.text ?? '{}';
    const parsed = JSON.parse(raw);
    return parsed.is_power_pole === true;
  } catch {
    // If the fast check fails, default to true so we don't accidentally block a real image
    return true;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function analyzeImage(
  file: File,
  hint: ImageTypeHint = 'auto',
  doubleCheck = false,
  onProgress?: (step: string) => void
): Promise<AnalyseResult> {
  onProgress?.('Resizing image…');
  const resized = await resizeImage(file, MAX_IMAGE_SIDE, JPEG_QUALITY);
  const { base64, mimeType } = await imageToBase64(resized);

  const client = buildClient();

  onProgress?.('Verifying image contents…');
  const isPole = await preFlightCheck(client, base64, mimeType);
  if (!isPole) {
    throw new Error('NOT_A_POLE');
  }

  onProgress?.('AI is analysing…');

  let data: GeminiResponse;
  try {
    data = await callGemini(client, base64, mimeType, hint);
  } catch (firstErr) {
    const firstMsg = String(firstErr);
    if (firstMsg.includes('429') || firstMsg.includes('quota')) {
      throw new Error('FREE_LIMIT_REACHED');
    }
    if (firstMsg.includes('VITE_GEMINI_API_KEY') || firstMsg.includes('401') || firstMsg.includes('403')) {
      throw new Error('INVALID_API_KEY');
    }

    // Retry once with error context
    onProgress?.('Retrying after schema error…');
    try {
      data = await callGemini(client, base64, mimeType, hint, firstMsg, false);
    } catch (secondErr) {
      // Translate API errors to friendly messages
      const msg = String(secondErr);
      if (msg.includes('429') || msg.includes('quota')) {
        throw new Error('FREE_LIMIT_REACHED');
      }
      if (msg.includes('VITE_GEMINI_API_KEY') || msg.includes('401') || msg.includes('403')) {
        throw new Error('INVALID_API_KEY');
      }
      throw new Error('ANALYSIS_FAILED');
    }
  }

  if (data.image_type === 'thermal') {
    throw new Error('THERMAL_NOT_SUPPORTED');
  }

  if (data.image_type === 'invalid' || data.is_power_pole === false) {
    throw new Error('NOT_A_POLE');
  }

  if (!doubleCheck) return { data };

  // Double-check mode — run a second call and compare
  onProgress?.('Running double-check…');
  let data2: GeminiResponse;
  try {
    data2 = await callGemini(client, base64, mimeType, hint, undefined, true);
  } catch {
    // If second call fails, just return first result
    return { data };
  }

  let disagreement = false;
  
  disagreement = data.components.some((c, i) => {
    const c2 = data2.components[i];
    return c.issue_type !== c2.issue_type && c.visible && c2.visible;
  });

  return { data, doubleCheckDisagreement: disagreement };
}
