# ASSUMPTIONS.md

Decisions not specified in the build spec — documented here per the spec's instruction.

## General

| Decision | Choice | Reasoning |
|---|---|---|
| Blur threshold | `BLUR_WARN_THRESHOLD = 80` (Laplacian variance) | Empirically reasonable: sharp outdoor images score >200, soft images 50–150, very blurry <50. Value is configurable in `settings.ts`. |
| Low-res warning trigger | `minSide < 480 px` (1.5× the hard MIN) | 320 px is the hard floor; below 480 px gives the blur warning for low-quality results without failing outright. |
| Thermal `NEEDS_INPUT` vs `NEEDS_INPUT` on negative temps | Negative values rejected via `THERMAL_TEMP_MIN = 0` | Electrical hotspot scans are always positive; negatives indicate sensor error or data corruption. |
| `GOOD_ESTIMATED` mapped to `GOOD` verdict | `ThermalVerdict.GOOD_ESTIMATED` is an internal signal; the `Report.verdict` shows `GOOD` | The external verdict is what the UI shows; the estimated flag is surfaced separately as a badge. |

## Styling

| Decision | Choice |
|---|---|
| Primary accent colour | Electric blue `#3b82f6` (Tailwind blue-500) |
| Dark background | `#020617` (Tailwind slate-950) |
| Font | Inter (Google Fonts, via preload link in `index.html`) |
| Tailwind version | v4 with `@tailwindcss/vite` plugin (no separate `tailwind.config.js` needed) |

## File structure

| Decision | Choice |
|---|---|
| `App.css` from scaffold | Kept but unused (not imported); TypeScript linter ignores CSS files |
| Stale `vite.svg` / `react.svg` in `public/assets` | Cleaned out; only `favicon.svg` retained |
| `eval/` directory | Stub runner only — full eval needs `tsx` installed separately; documented in README |

## AI / Gemini

| Decision | Choice |
|---|---|
| Default model | `gemini-2.5-flash` — supports image input + structured JSON output on free tier |
| Temperature | 0 (deterministic) as spec requires |
| Retry count | 1 retry on schema parse failure, then hard error |
| Double-check | Off by default; toggled in UI; runs second API call if enabled |
| `responseSchema` format | JSON-Schema object passed verbatim to the SDK (`config.responseSchema`) |

## Tests

| Decision | Choice |
|---|---|
| Test environment | `jsdom` (for DOM globals needed by test setup) |
| Test scope | Rule engine + thermal logic + Zod schema — no component rendering tests (pure unit tests are sufficient per spec) |
| `import.meta.env` in tests | Stubbed via `vitest.config.ts` `env:` block — no `.env` file needed to run tests |

## Known gaps (not in spec, not built)

- `eval/run.ts` is a documented stub. A full eval runner would require `tsx`, `dotenv`, and Node.js file-system access, which is outside the browser-only build constraint.
- No history / report saving (spec says "later" upgrade).
- No tiling for large images (spec says "later" upgrade).
