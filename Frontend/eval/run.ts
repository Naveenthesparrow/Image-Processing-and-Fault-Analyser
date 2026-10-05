import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_RESPONSE_SCHEMA, GeminiResponseSchema } from '../src/ai/schema';
import { buildPrompt } from '../src/ai/prompt';
import { buildReport } from '../src/logic/rules';
import { GEMINI_API_KEY, GEMINI_MODEL } from '../src/config/settings';

// Load .env (if you want to run this independently, ensure you run with node --env-file=.env or similar)
// We assume process.env.VITE_GEMINI_API_KEY is available.

interface Label {
  image: string;
  expected_image_type: 'rgb' | 'thermal' | 'invalid';
  expected_verdict: string;
  expected_components?: Record<string, string>;
  expected_thermal_min_c?: number;
  expected_thermal_max_c?: number;
  notes?: string;
}

const LABELS_FILE = path.resolve(process.cwd(), 'eval', 'labels.json');
const IMAGES_DIR = path.resolve(process.cwd(), 'eval');

async function runEval() {
  if (!fs.existsSync(LABELS_FILE)) {
    console.error(`Labels file not found: ${LABELS_FILE}`);
    console.error('Please copy eval/labels.example.json to eval/labels.json and add your test images.');
    process.exit(1);
  }

  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    console.error('VITE_GEMINI_API_KEY is not set in environment or .env file.');
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });
  const model = GEMINI_MODEL || 'gemini-2.5-flash';
  const labels: Label[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));

  let total = 0;
  let correctVerdict = 0;
  let falseGoods = 0;
  let correctIssues = 0;
  let totalIssuesEvaluated = 0;

  console.log(`\nStarting eval for ${labels.length} images using model ${model}...\n`);

  for (const label of labels) {
    const imgPath = path.resolve(IMAGES_DIR, label.image);
    if (!fs.existsSync(imgPath)) {
      console.warn(`[SKIP] Image not found: ${imgPath}`);
      continue;
    }

    const ext = path.extname(imgPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const base64 = fs.readFileSync(imgPath, 'base64');

    total++;
    process.stdout.write(`Analyzing ${label.image}... `);

    try {
      const promptText = buildPrompt('auto');
      const response = await client.models.generateContent({
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

      const raw = response.text ?? '';
      const parsed = JSON.parse(raw);
      const geminiData = GeminiResponseSchema.parse(parsed);

      // Run through rule engine
      const report = buildReport(geminiData, { blurWarning: false, lowResWarning: false });

      // Verdict Accuracy
      const verdictMatch = report.verdict === label.expected_verdict;
      if (verdictMatch) {
        correctVerdict++;
      } else {
        if (label.expected_verdict === 'DEFECT_FOUND' && report.verdict === 'GOOD') {
          falseGoods++;
        }
      }

      // Issue-type accuracy
      let issueErrors = [];
      if (label.expected_components && report.components) {
        for (const [compName, expectedIssue] of Object.entries(label.expected_components)) {
          totalIssuesEvaluated++;
          const actualComp = report.components.find(c => c.component === compName);
          const actualIssue = actualComp?.issueType ?? null;
          if (actualIssue === expectedIssue) {
            correctIssues++;
          } else {
             issueErrors.push(`${compName}: expected ${expectedIssue}, got ${actualIssue}`);
          }
        }
      }

      if (verdictMatch && issueErrors.length === 0) {
        console.log('✅ PASS');
      } else {
        console.log('❌ FAIL');
        if (!verdictMatch) console.log(`   Verdict: expected ${label.expected_verdict}, got ${report.verdict}`);
        if (issueErrors.length > 0) console.log(`   Issues: ${issueErrors.join(', ')}`);
      }

    } catch (err) {
      console.log('❌ ERROR');
      console.error(err);
    }
  }

  console.log('\n=============================================');
  console.log('EVALUATION RESULTS');
  console.log('=============================================');
  console.log(`Total Images Evaluated: ${total}`);
  console.log(`Verdict Accuracy:       ${((correctVerdict / total) * 100 || 0).toFixed(1)}% (${correctVerdict}/${total})`);
  
  if (totalIssuesEvaluated > 0) {
    console.log(`Issue-type Accuracy:    ${((correctIssues / totalIssuesEvaluated) * 100).toFixed(1)}% (${correctIssues}/${totalIssuesEvaluated})`);
  } else {
    console.log(`Issue-type Accuracy:    N/A (no expected components specified)`);
  }
  
  console.log(`FALSE GOOD Count:       ${falseGoods} ${falseGoods > 0 ? '⚠️ DANGER' : '✅ (Perfect)'}`);
  console.log('=============================================\n');
}

runEval().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});
