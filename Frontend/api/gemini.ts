// Vercel serverless function: forwards analysis requests to Gemini so the API key
// stays on the server. Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in the
// Vercel project's Environment Variables — NOT as VITE_* vars.

import { GoogleGenAI } from '@google/genai';

const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(401, { error: 'GEMINI_API_KEY is not configured on the server' });

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return json(413, { error: 'Image too large' });

  let body: { contents?: unknown; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!Array.isArray(body.contents)) return json(400, { error: 'Missing contents' });

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      // Model is fixed server-side so callers can't switch to a different/paid model
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      contents: body.contents as never,
      config: body.config as never,
    });
    return json(200, { text: response.text ?? '' });
  } catch (err) {
    const status = typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return json(status, { error: message });
  }
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
