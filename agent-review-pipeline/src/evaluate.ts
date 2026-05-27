/**
 * Evaluate entry point — runs Stage B + C + scoring on Stage A output.
 *
 * Usage: node dist/evaluate.js --stage-a <path-to-stage-a.json> --dataverse-host <host>
 *
 * Expects environment variables: CLIENT_ID, TENANT_ID, CLIENT_SECRET
 * Outputs the full EvaluationResult JSON to stdout.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runEvaluation } from './evaluation/evaluationOrchestrator.js';
import { generatePdfReport } from './report/pdfReport.js';
import type { LocalStageAOutput } from './models/types.js';

const { values } = parseArgs({
  options: {
    'stage-a': { type: 'string' },
    'dataverse-host': { type: 'string' },
    threshold: { type: 'string', default: '60' },
    output: { type: 'string' },
    'pdf-output': { type: 'string' },
  },
});

if (!values['stage-a'] || !values['dataverse-host']) {
  console.error('Usage: node dist/evaluate.js --stage-a <path> --dataverse-host <host>');
  process.exit(1);
}

const { CLIENT_ID, TENANT_ID, CLIENT_SECRET } = process.env;
if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
  console.error('Missing environment variables: CLIENT_ID, TENANT_ID, CLIENT_SECRET');
  process.exit(1);
}

// Acquire OAuth token for Dataverse
const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const tokenResponse = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    scope: `https://${values['dataverse-host']}/.default`,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  }),
});

if (!tokenResponse.ok) {
  console.error(`OAuth token request failed: ${tokenResponse.status}`);
  process.exit(1);
}

const tokenData = (await tokenResponse.json()) as { access_token: string };
if (!tokenData.access_token) {
  console.error('OAuth response missing access_token');
  process.exit(1);
}

// Load Stage A output (may be a single object or an array of results)
const stageAJson = readFileSync(values['stage-a'], 'utf-8');
const parsed = JSON.parse(stageAJson);
const stageAOutputs: LocalStageAOutput[] = Array.isArray(parsed) ? parsed : [parsed];

// Filter out empty/invalid entries
const validOutputs = stageAOutputs.filter(
  (o) => o && (o.topicComponents?.length || o.agentInstructions?.trim())
);

if (validOutputs.length === 0) {
  console.error('Stage A output is empty or has no evaluatable content');
  const emptyResult = {
    agents: [],
    overall: { passed: true, lowestScore: 100, threshold: parseInt(values.threshold ?? '60', 10), agentCount: 0 },
    errors: ['No evaluatable content in Stage A output'],
  };
  console.log(JSON.stringify(emptyResult, null, 2));
  process.exit(0);
}

// Run evaluation for each agent
const threshold = parseInt(values.threshold ?? '60', 10);
const agentResults = [];

for (const stageAOutput of validOutputs) {
  console.log(`\n=== Evaluating: ${stageAOutput.botName} ===`);
  const result = await runEvaluation(
    values['dataverse-host'],
    tokenData.access_token,
    stageAOutput,
    threshold
  );
  agentResults.push(result);
}

// Compute overall pass/fail (all agents must pass)
const lowestScore = Math.min(...agentResults.map((r) => r.scores.overallScore));
const allPassed = agentResults.every((r) => r.scores.passed);

// Build report URL from GitHub Actions environment
const reportUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;

const finalResult = {
  agents: agentResults,
  overall: {
    passed: allPassed,
    lowestScore,
    threshold,
    agentCount: agentResults.length,
  },
  // Backward-compatible: flow reads scores.passed / scores.overallScore
  scores: {
    passed: allPassed,
    overallScore: lowestScore,
    threshold,
    patternScore: agentResults.length === 1 ? agentResults[0].scores.patternScore : lowestScore,
    instructionScore: agentResults.length === 1 ? agentResults[0].scores.instructionScore : lowestScore,
  },
  // Link to the GitHub Actions run (includes downloadable PDF artifact)
  reportUrl: reportUrl ?? '',
};

// Output result
const jsonOutput = JSON.stringify(finalResult, null, 2);
if (values.output) {
  writeFileSync(values.output, jsonOutput);
  console.error(`Evaluation result written to ${values.output}`);
} else {
  console.log(jsonOutput);
}

// Generate PDF report
if (values['pdf-output']) {
  try {
    const pdfBuffer = generatePdfReport(agentResults);
    writeFileSync(values['pdf-output'], pdfBuffer);
    console.error(`PDF report written to ${values['pdf-output']}`);
  } catch (err) {
    console.error(`PDF generation failed: ${err instanceof Error ? err.message : err}`);
  }
}
