import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AgentReviewApp.tsx"),
  "utf8",
);

/** Slice the display-mode request that both the expand and the return paths use. */
function resultDisplayRequest(): string {
  const start = source.indexOf("const requestResultDisplay = async (");
  const end = source.indexOf("const openFullReview = async", start);
  assert.notEqual(start, -1, "requestResultDisplay is missing");
  assert.notEqual(end, -1, "openFullReview is missing");
  return source.slice(start, end);
}

test("asset choices use the same light-tint tabs as the Agent Map view switch", () => {
  const start = source.indexOf('label="What kind of asset are you reviewing?"');
  const end = source.indexOf('label="Choose Environment"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const assetChoices = source.slice(start, end);

  assert.match(
    assetChoices,
    /<TabList[\s\S]*?appearance="subtle-circular"[\s\S]*?selectedValue="copilot-studio"/,
  );
  assert.match(assetChoices, /<TabList[\s\S]*?size="small"/);
  assert.match(source, /assetIcon:\s*\{[\s\S]{0,100}width:\s*"16px"/);
  assert.match(source, /assetIcon:\s*\{[\s\S]{0,100}height:\s*"16px"/);
  assert.match(assetChoices, /<PuzzlePieceColor fontSize=\{16\}/);
  assert.match(assetChoices, /<Tab[\s\S]*?value="copilot-studio"/);
  assert.match(assetChoices, /<Tab[\s\S]*?value="declarative-agent"[\s\S]*?disabled/);
  assert.match(assetChoices, /<Tab[\s\S]*?value="skill"[\s\S]*?disabled/);
  assert.equal(assetChoices.includes('appearance="primary"'), false);
});

test("review results survive an exact invocation fullscreen remount", () => {
  assert.match(source, /selectionId\?:\s*string/);
  assert.match(
    source,
    /readAgentReviewSnapshot\(reviewStorage,\s*replayed\.selectionId \?\? replayed\.reviewId\)/,
  );
  assert.match(
    source,
    /writeAgentReviewSnapshot\(reviewStorage,[\s\S]{0,500}selectionId[:,]/,
  );
  assert.match(source, /readSavedReview\(requestedReviewId, "fullReview"\)/);
  assert.match(
    source,
    /if \(!output\.model\) throw new Error\("The response did not include the complete saved findings\."\)/,
  );
  assert.match(source, /const intendedState = mode === "fullscreen" \? "fullReview" : "summary"/);
  assert.match(source, /save\(resultState\);\s*setState\(resultState\);/);
  assert.match(source, /\{\s*app,\s*data,\s*host,[^}]*\breplaceData\b[^}]*\}\s*=\s*useMcpApp\(\)/);
  assert.match(
    source,
    /replaceData\(\{[\s\S]{0,300}state:\s*"summary"[\s\S]{0,300}selectionId[:,]/,
  );
});

test("summary expansion persists fullscreen state before requesting a host remount", () => {
  const start = source.indexOf("const openFullReview = async");
  const end = source.indexOf("const fullscreenAvailable =", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(source.slice(start, end), /await requestResultDisplay\("fullscreen", output\.model\)/);

  const display = resultDisplayRequest();
  const requestIndex = display.indexOf("app.requestDisplayMode({ mode })");
  assert.notEqual(requestIndex, -1);
  assert.match(display, /const intendedState = mode === "fullscreen" \? "fullReview" : "summary"/);
  assert.match(
    display,
    /const save = \([^)]*\) =>\s*writeAgentReviewSnapshot\(reviewStorage, \{[\s\S]{0,120}state: resultState/,
  );
  // The host can remount the app before the request resolves. Only the saved snapshot survives the remount.
  assert.match(
    display.slice(0, requestIndex),
    /if \(!save\(intendedState, intendedNavigation\(\)\)\) throw new Error\(/,
  );
  assert.match(
    display,
    /const publish = \([^)]*\) => \{\s*save\(resultState\);\s*setState\(resultState\);\s*replaceData\(\{[\s\S]{0,120}state: resultState/,
  );
  assert.match(display.slice(requestIndex), /publish\(intendedState\)/);
});

test("review identity follows the arriving tool result instead of the first empty mount", () => {
  assert.equal(source.includes("useRef(initial.selectionId)"), false);
  assert.equal(source.includes("selectionIdRef"), false);
  assert.match(source, /const selectionId = initial\.selectionId \?\? replayed\.selectionId/);
  assert.match(source, /const missingInitialData = data === null && !restored\b/);
  assert.match(source, /if \(missingInitialData\) \{[\s\S]{0,500}Restoring Agent Review/);
});

test("the bootstrap restoration guard runs after every Agent Review hook", () => {
  const componentStart = source.indexOf("export function AgentReviewApp()");
  const component = source.slice(componentStart);
  const guardIndex = component.indexOf("if (missingInitialData) {");
  const hookIndexes = [...component.matchAll(/\buse[A-Z]\w*\s*\(/g)]
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined);

  assert.notEqual(componentStart, -1);
  assert.notEqual(guardIndex, -1);
  assert.match(component.slice(guardIndex), /^if \(missingInitialData\) \{\s*return /);
  assert.ok(hookIndexes.length > 0);
  assert.ok(
    hookIndexes.every((index) => index < guardIndex),
    "AgentReviewApp conditionally adds hooks after bootstrap data arrives",
  );
});

test("fullscreen relies on the host close control and a host return shows the clean map", () => {
  assert.equal(source.includes("Exit full" + "screen"), false);
  assert.equal(source.includes("Arrow" + "MinimizeRegular"), false);
  assert.equal(source.includes('requestResultDisplay("inline"'), false);
  assert.match(source, /\{!expanded && <Tooltip content="Expand to fullscreen" relationship="label">/);
  // The host close control changes the display mode. The view then shows the inline summary with the clean map.
  assert.match(
    source,
    /host\?\.displayMode === "inline" && current === "fullReview" \? "summary" : current/,
  );
  assert.match(
    source,
    /if \(previous !== "fullReview" \|\| state !== "summary"\) return;\s*changeResultNavigation\(cleanMapIntent\(resultNavigation\.current\)\);/,
  );
  // The view saves and publishes the inline summary, the same as an app exit request did.
  assert.match(
    source,
    /writeAgentReviewSnapshot\(reviewStorage, \{ \.\.\.summary, state: "summary" \}\);\s*replaceData\(\{ \.\.\.replayed, \.\.\.summary, state: "summary" \}\);/,
  );
});

test("running review progress replaces the form with an embedded status card", () => {
  const progressStart = source.indexOf(
    'if (simulation || ["starting", "running", "finalizing", "failed"].includes(state))',
  );
  const progressEnd = source.indexOf('if (state === "background")', progressStart);
  assert.notEqual(progressStart, -1);
  assert.notEqual(progressEnd, -1);
  const progressSurface = source.slice(progressStart, progressEnd);

  assert.equal(source.includes("ReviewProgressDialog"), false);
  assert.equal(source.includes("dialogHost"), false);
  assert.match(progressSurface, /styles\.progressCard/);
  assert.match(progressSurface, /role="status"/);
  assert.match(progressSurface, /aria-live="polite"/);
  assert.match(progressSurface, /<ProgressBar/);
  assert.match(progressSurface, /stages\.map/);
  assert.match(progressSurface, /Continue in background/);
  assert.match(progressSurface, /Retry/);
});

test("Agent node keeps the workflow attribution mark used by the original dialog", () => {
  assert.match(
    source,
    /import\s*\{\s*WorkflowMark,\s*WorkflowMarkColor,?\s*\}\s*from\s*"\.\.\/\.\.\/agent-review\/ui\/components\/WorkflowMark\.js"/,
  );
  assert.match(
    source,
    /stage\.status === "completed"\s*\?\s*<WorkflowMarkColor size=\{16\}\s*\/>[\s\S]{0,160}<WorkflowMark\s+size=\{16\}/,
  );
  const attributionStart = source.indexOf('stage.attribution === "workflow-agent"');
  const attributionEnd = source.indexOf("stage.detail", attributionStart);
  assert.equal(
    source.slice(attributionStart, attributionEnd).includes("BotSparkle24Color"),
    false,
  );
});

test("the embedded progress card preserves the original dialog content contract", () => {
  const progressStart = source.indexOf(
    'if (simulation || ["starting", "running", "finalizing", "failed"].includes(state))',
  );
  const progressEnd = source.indexOf('if (state === "background")', progressStart);
  const progressSurface = source.slice(progressStart, progressEnd);

  for (const stage of [
    "Initializing",
    "Parsing Configuration",
    "Evaluating Patterns",
    "Checking Compliance",
    "Saving Results",
    "Complete",
  ]) {
    assert.ok(source.includes(stage), `progress UI is missing ${stage}`);
  }
  assert.match(
    progressSurface,
    /buildCopilotReviewProgressStages\([\s\S]{0,200}progressStagesRef\.current/,
  );
  assert.match(
    progressSurface,
    /Circle20Regular[\s\S]{0,120}color:\s*tokens\.colorNeutralForegroundDisabled/,
  );
  assert.match(progressSurface, /<ReviewErrorContent\s+title="Review failed"/);
  assert.equal(progressSurface.includes("Back to form"), false);
});

test("agent-wide review progress never claims it is analysing zero components", () => {
  assert.match(
    source,
    /total > 0\s*\?\s*`Review agent is analysing \$\{total\}[\s\S]{0,180}Review agent is analysing the agent/,
  );
  assert.match(
    source,
    /<ReviewWaitFooter[\s\S]{0,200}scopeSummary=\{total > 0[\s\S]{0,120}"Agent-wide analysis"/,
  );
});

test("completed review progress transitions directly to the inline summary", () => {
  const pollStart = source.indexOf("const poll = async");
  const pollEnd = source.indexOf("const start = async", pollStart);
  const poll = source.slice(pollStart, pollEnd);
  const readStart = source.indexOf("const readSavedReview = (");
  const readEnd = source.indexOf("const selectEnvironment = async", readStart);

  assert.notEqual(pollStart, -1);
  assert.notEqual(pollEnd, -1);
  assert.notEqual(readStart, -1);
  assert.notEqual(readEnd, -1);
  assert.match(
    source.slice(readStart, readEnd),
    /call\("get_agent_review_result", \{ reviewId: id, presentation \}\)/,
  );
  assert.match(
    poll,
    /readSavedReview\(completedReviewId, "summary"\)[\s\S]{0,500}writeAgentReviewSnapshot[\s\S]{0,500}replaceData[\s\S]{0,300}setState\("summary"\)/,
  );
});
