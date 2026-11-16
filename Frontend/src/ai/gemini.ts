import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_PROXY_URL, API_TIMEOUT_MS, MAX_IMAGE_SIDE, JPEG_QUALITY } from '../config/settings';
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

type GenerateRequest = Parameters<GoogleGenAI['models']['generateContent']>[0];

/**
 * Send one generateContent request.
 * - Local dev / eval: VITE_GEMINI_API_KEY is set → call Gemini directly.
 * - Deployed: no key in the browser → POST to our serverless proxy (api/gemini.ts),
 *   which holds the key server-side. Errors keep the HTTP status in the message
 *   so the 429/401/503 handling below works the same in both modes.
 */
async function generate(req: GenerateRequest, signal: AbortSignal): Promise<string> {
  if (GEMINI_API_KEY) {
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await client.models.generateContent({ ...req, config: { ...req.config, abortSignal: signal } });
    return response.text ?? '';
  }

  const res = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: req.contents, config: req.config }),
    signal,
  });
  const body = await res.json().catch(() => ({})) as { text?: string; error?: string };
  if (!res.ok) throw new Error(`${res.status} ${body.error ?? res.statusText}`);
  return body.text ?? '';
}

async function callGemini(
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

  let raw: string;
  try {
    raw = await generate({
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
    }, controller.signal);
  } finally {
    clearTimeout(timer);
  }

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

  // No separate "is this a pole?" call — the main response already carries
  // is_power_pole / image_type, which saves one request per upload.
  onProgress?.('AI is analysing…');

  let data: GeminiResponse;
  try {
    data = await callGemini(base64, mimeType, hint);
  } catch (firstErr) {
    const firstMsg = String(firstErr);
    if (firstMsg.includes('429') || firstMsg.includes('quota')) {
      throw new Error('FREE_LIMIT_REACHED');
    }
    if (firstMsg.includes('VITE_GEMINI_API_KEY') || firstMsg.includes('401') || firstMsg.includes('403')) {
      throw new Error('INVALID_API_KEY');
    }

    // Server overloaded (503) — wait before retrying instead of hammering it
    const overloaded = firstMsg.includes('503') || firstMsg.includes('overloaded') || firstMsg.includes('UNAVAILABLE');
    onProgress?.(overloaded ? 'AI server busy, retrying…' : 'Retrying after schema error…');
    if (overloaded) await new Promise((r) => setTimeout(r, 3000));

    // Retry once (with error context only for schema problems)
    try {
      data = await callGemini(base64, mimeType, hint, overloaded ? undefined : firstMsg, false);
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
    data2 = await callGemini(base64, mimeType, hint, undefined, true);
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
