# ⚡ Power Pole Inspector

AI-powered power pole defect inspection — upload an RGB or thermal image, get a structured safety report.

---

## What It Does

1. Upload a power-pole photo (RGB or thermal).
2. Gemini analyses it once with a strict JSON schema.
3. A **rule engine in our code** (not Gemini) decides issues, severity (0–5), and verdict.
4. The app shows: verdict banner, annotated image with bounding boxes, 5 component cards, and a plain-text summary.

> **Core principle:** Gemini only reports *observations*. Our code decides the *verdict*.

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set up your API key
cp .env.example .env
# Edit .env — add your key from https://aistudio.google.com/

# 3. Run dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_GEMINI_API_KEY` | Your Google AI Studio API key |
| `VITE_GEMINI_MODEL` | Model name (default: `gemini-2.5-flash`) |

`.env` is in `.gitignore` and must never be committed.

---

## ⚠️ Security Note

**The API key is bundled into the browser build — anyone who opens the site can extract it.**

This is acceptable for a local demo / viva. To harden before any public deployment:

- Add a small backend proxy server. The only file to change is `src/ai/gemini.ts` (`analyzeImage` function).
- Restrict the key's permissions in [Google AI Studio](https://aistudio.google.com/) or Google Cloud → restrict to specific HTTP referrers.
- **Never deploy publicly with the raw key in the build.**

---

## Running Tests

```bash
npm test            # run once (must all pass)
npm run test:watch  # watch mode during development
npm run test:ui     # Vitest UI browser mode
```

All 38 tests cover:
- Every issue → severity mapping
- Verdict table: GOOD, DEFECT_FOUND, INCONCLUSIVE, INVALID, NEEDS_REVIEW, NEEDS_INPUT
- Confidence thresholds (MIN 0.50, LOW 0.70)
- Thermal edge cases: 69.9, 70.0, 70.1, null, negative, > 500
- Zod schema validation

---

## Accuracy Evaluation

```bash
# Optional: full eval runner requires tsx
npm install -D tsx

# Place test images in eval/images/
# Copy and fill eval/labels.example.json → eval/labels.json
npm run eval
```

The eval script prints a table: expected vs actual verdict, and flags **false GOODs** (defective image called GOOD — the most dangerous error).

---

## Manual Test Checklist

Before each demo, verify these scenarios:

| Scenario | Expected |
|---|---|
| Good RGB pole, all healthy | GOOD banner |
| Cracked insulator (clear photo) | DEFECT FOUND — Severity 4 |
| Tilted pole | DEFECT FOUND — Severity 4 |
| Vegetation touching wire | DEFECT FOUND — Severity 4 |
| Hot thermal image (> 70 °C) | DEFECT FOUND with temperature |
| Cool thermal (< 70 °C) | GOOD |
| Thermal with no readable temp | NEEDS INPUT → manual entry box |
| Random non-pole photo | INVALID |
| Blurry image | Warning + INCONCLUSIVE or DEFECT |
| File > 15 MB | Hard fail with tip |
| Wrong file type (PDF) | Hard fail with tip |
| No internet / bad API key | Friendly error, no crash |

---

## Known Limits

1. **Sag estimation from a single photo** is inherently imprecise — only reported when the full wire span is clearly visible.
2. **Tiny cracks** may be missed after the 2048 px resize. Use the highest-resolution image available.
3. **Thermal temperature** from a screenshot is only as accurate as the printed text or colour scale. Use the thermal camera's own reading or the manual input box for exact values.
4. **Free Gemini tier** has rate limits (~15 RPM). The app shows a friendly message on 429 errors.
5. **API key visibility** in browser builds (see Security Note above).

---

## Upgrade Path

| Later change | Where it plugs in |
|---|---|
| Hide API key | Add backend proxy; change only `src/ai/gemini.ts` |
| Better accuracy on large images | Add 2×2 tiling inside `gemini.ts`, merge boxes in `boxes.ts` |
| Own trained detector | New `src/ai/detector.ts`, same observation shape — rules unchanged |
| Exact thermal values (radiometric) | New parser/API client in `logic/thermal.ts` input stage |
| History / report storage | Add localStorage or a backend — no logic changes needed |

---

## Architecture

```
src/
├── config/
│   ├── taxonomy.ts    ← SINGLE SOURCE OF TRUTH for all labels
│   └── settings.ts    ← all thresholds, reads .env
├── ai/
│   ├── gemini.ts      ← one API call per image, retry, error handling
│   ├── prompt.ts      ← prompt built FROM taxonomy
│   └── schema.ts      ← Gemini responseSchema + Zod validation
├── logic/
│   ├── rules.ts       ← PURE rule engine: observation → Report
│   ├── thermal.ts     ← thermal rules (tested independently)
│   └── rules.test.ts  ← all unit tests (38 tests)
├── utils/
│   ├── image.ts       ← validate, resize, blur score, base64
│   └── boxes.ts       ← Gemini box → pixel box
└── components/        ← React UI components
```

---

## Stack

- **Vite + React + TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **@google/genai** SDK (browser)
- **Zod** for schema validation
- **Vitest** for unit tests
- **Inter** font via Google Fonts

---

*AI-assisted result. Critical findings should be verified by a qualified inspector.*
