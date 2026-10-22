import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_DEADLINE_MS,
  ReviewJobStatus,
  UNCLAIMED_JOB_TIMEOUT_MS,
} from "../core/index.js";
import {
  buildReviewEnvironmentFilter,
  resolveReviewJobStatus,
} from "./service";

test("includes legacy shared reviews for every selected environment", () => {
  const filter = buildReviewEnvironmentFilter({
    name: "Power CAT Explore",
    apiUrl: new URL("https://org.crm.dynamics.com/"),
  });

  assert.match(filter, /cat_sourceenvironment eq 'Power CAT Explore'/);
  assert.match(filter, /cat_sourceenvironment eq 'https:\/\/org\.crm\.dynamics\.com'/);
  assert.match(filter, /cat_sourceenvironment eq 'https:\/\/org\.crm\.dynamics\.com\/'/);
  assert.match(filter, /cat_sourceenvironment eq ''/);
  assert.match(filter, /cat_sourceenvironment eq null/);
  assert.match(filter, /cat_sourceenvironment eq 'zip'/);
});

test("Agent Map loads maker icons for connected agents by exact bot schema name", () => {
  const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

  assert.match(source, /schemaname,iconbase64/);
  assert.match(source, /connectedAgentIcons/);
  assert.match(source, /\bagentIcons,\s*\n/);
});

test("connected Agent Map expansion resolves one active published bot by exact schema", () => {
  const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

  assert.match(source, /async getConnectedAgentMap\(/);
  assert.match(source, /schemaname eq '\$\{escapeOData\(schemaName\)\}'/);
  assert.match(source, /statecode eq 0 and componentstate eq 0/);
  assert.match(source, /this\.getAgentMap\(/);
});

test("an unclaimed review job stops polling after the shared workflow timeout", () => {
  const createdAt = Date.parse("2026-08-24T10:00:00.000Z");
  const status = resolveReviewJobStatus({
    jobStatus: ReviewJobStatus.Queued,
    completedComponents: 0,
    createdAt,
    now: createdAt + UNCLAIMED_JOB_TIMEOUT_MS,
  });

  assert.equal(status.status, "failed");
  assert.equal(status.nextPollMs, null);
  assert.match(status.error ?? "", /did not pick up this job/i);
});

test("a non-terminal review job cannot poll forever", () => {
  const createdAt = Date.parse("2026-08-24T10:00:00.000Z");
  const status = resolveReviewJobStatus({
    jobStatus: ReviewJobStatus.Running,
    completedComponents: 0,
    createdAt,
    now: createdAt + DEFAULT_DEADLINE_MS,
  });

  assert.equal(status.status, "failed");
  assert.equal(status.nextPollMs, null);
  assert.match(status.error ?? "", /did not finish within 45 minutes/i);
});
