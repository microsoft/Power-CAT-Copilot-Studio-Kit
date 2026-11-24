import { describe, expect, it, vi } from "vitest";
import type { AnalysisReportBlock, AnalysisReportContentBlock, AnalysisReportInput } from "../contracts/analysis-report";
import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import { buildAnalysisReport } from "./analysis-report";
import { reportEvidence } from "./report-evidence";
import { renderAnalysisHtml } from "../services/analysis-html";
import { buildWorkflowModel } from "../components/flow/WorkflowCanvasModel";

vi.mock("../services/dataverse-client", () => ({
  getDataverseClient: () => { throw new Error("Report export must not access Dataverse."); },
  escapeODataStringLiteral: (value: string) => value.replace(/'/g, "''"),
}));
vi.mock("./power-apps-init", () => ({
  ensurePowerAppsInitialized: () => { throw new Error("Report export must not initialize connectors."); },
}));
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({ executeAsync: () => { throw new Error("Report export must not call connectors."); } }),
}));

function input(): AnalysisReportInput {
  const turns = [1, 2].flatMap((n) => [
    {
      id: `user-${n}`, role: "user" as const, content: `Session ${n} question`,
      timestamp: `2026-11-04T10:0${n}:00Z`,
      activities: [{ id: `user-${n}`, type: "message", mergedSessionKey: `session-${n}` }],
      debugInfo: { stepExecutions: [{
        stepId: `step-${n}`, taskDialogId: "test.action.lookup", state: n === 1 ? 1 : 2,
        executionTime: n === 1 ? "00:00:01.000" : undefined,
        arguments: { query: `query-${n}` }, observation: { result: `result-${n}` },
      }] },
    },
    {
      id: `bot-${n}`, role: "assistant" as const, content: `Session ${n} answer`,
      timestamp: `2026-11-04T10:0${n}:01Z`,
      activities: [{ id: `bot-${n}`, type: "message", mergedSessionKey: `session-${n}` }],
    },
  ]);
  return {
    agentName: "Support agent", conversationId: "conversation:unsafe/name",
    source: "snapshot",
    conversation: { id: "conv", messages: [], generalInfo: {
      numberOfSessions: 2, numberOfTurns: 2, globalOutcome: "Resolved", totalDuration: 61000,
      inactivityCounts: 1, totalTokensUsed: 20, model: "test-model", gptAnswerState: "", contentModeration: "",
    } },
    transcript: { turns, generalInfo: { durationMs: 61000, turnCount: 2 }, raw: { activities: turns.flatMap((t) => t.activities) } },
    sessions: [], connectedAgents: [], componentNames: {
      "test.action.lookup": { name: "Lookup records", description: "", modelDisplayName: "", modelDescription: "", triggerQueries: [] },
    },
    warnings: [],
  };
}

function contents(report: ReturnType<typeof buildAnalysisReport>): string {
  const blockText = (block: AnalysisReportBlock): string => block.kind === "exchange"
    ? `${block.heading}\n${block.steps.map(step => `${step.heading}\n${step.blocks.map(blockText).join("\n")}`).join("\n")}` : block.kind === "fields"
    ? block.fields.map(field => `${field.label}: ${field.value}`).join("\n") : block.kind === "table"
      ? [block.columns, ...block.rows].map(row => row.join(" | ")).join("\n") : block.text;
  return report.sections.map(s => `${s.heading}\n${s.blocks.map(blockText).join("\n")}`).join("\n");
}

function contentBlocks(blocks: AnalysisReportBlock[]): AnalysisReportContentBlock[] {
  return blocks.flatMap(block => block.kind === "exchange" ? block.steps.flatMap(step => step.blocks) : [block]);
}

describe("full Agent Debugger analysis export", () => {
  it("reconciles summary and session fields without copying stale UI totals", () => {
    const data = input();
    Object.assign(data.conversation.generalInfo, { numberOfSessions: 99, numberOfTurns: 13,
      totalDuration: 1000, conversationStartTime: "2026-11-04T13:00:00Z",
      conversationId: "canonical-conversation", model: "agent-schema-not-an-llm" });
    data.transcript.turns[0].debugInfo!.tokenInfo = { model: "recorded-llm", promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    data.sessions = [1, 2].map(n => ({
      n, startText: "", startTimeUtc: `2026-11-04T1${n}:00:00Z`,
      endTimeUtc: `2026-11-04T1${n}:01:00Z`, durationMs: 1,
      type: "Unengaged", outcome: "None", turnCount: 6, turnText: "6 turns",
    }));
    data.transcript.raw.activities.unshift(...data.sessions.map(session => ({
      type: "trace", valueType: "SessionInfo", mergedSessionKey: `session-${session.n}`, value: session,
    })));
    const before = JSON.stringify(data);
    const capturedAt = new Date("2026-11-04T15:00:00Z");
    const report = buildAnalysisReport(data, capturedAt);
    const block = report.sections[0].blocks[0];
    if (block.kind !== "fields") throw new Error("Missing summary fields");
    expect(Object.fromEntries(block.fields.map(field => [field.label, field.value]))).toMatchObject({
      "Conversation ID": "canonical-conversation", Sessions: "2", "User turns": "2",
      Outcome: "None", "Session duration": "2m 0s", Start: "2026-11-04T11:00:00.000Z",
      Model: "recorded-llm",
    });
    const sessions = report.sections[1].blocks.filter(block => block.kind === "fields");
    expect(sessions.map(block => block.fields.find(field => field.label === "User turns")?.value)).toEqual(["1", "1"]);
    expect(sessions.map(block => block.fields.find(field => field.label === "Duration")?.value)).toEqual(["1m 0s", "1m 0s"]);
    expect(report.offline?.identity?.conversationId).toBe("canonical-conversation");
    const html = renderAnalysisHtml(report);
    for (const value of ["canonical-conversation", "User turns", "Session duration", "2m 0s", "recorded-llm"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("agent-schema-not-an-llm");
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each([false, true])("does not invent summary outcomes, model names or durations when session evidence is incomplete; zero=%s", zero => {
    const data = input();
    data.sessions = [{ n: 1, startText: "", startTimeUtc: "2026-11-04T10:00:00Z",
      endTimeUtc: zero ? "2026-11-04T10:00:00Z" : undefined,
      durationMs: 9999, type: "", outcome: "Resolved", turnCount: 12, turnText: "12 turns" }];
    const block = buildAnalysisReport(data).sections[0].blocks[0];
    if (block.kind !== "fields") throw new Error("Missing summary fields");
    expect(Object.fromEntries(block.fields.map(field => [field.label, field.value]))).toMatchObject({
      Outcome: "Not recorded", Model: "Not recorded", "Session duration": zero ? "0 ms" : "Not recorded",
    });
  });

  it("reports mixed outcomes only when every session has recorded outcome evidence", () => {
    const data = input();
    const record = (key: string, outcome?: string) => ({
      type: "trace", valueType: "SessionInfo", mergedSessionKey: key,
      value: { outcome, startTimeUtc: "2026-11-04T10:00:00Z", endTimeUtc: "2026-11-04T10:01:00Z" },
    });
    data.transcript.raw.activities.unshift(
      record("session-1", "Resolved"), record("session-1", "Resolved"), record("session-2", "Escalated"),
    );
    const summary = () => {
      const block = buildAnalysisReport(data).sections[0].blocks[0];
      if (block.kind !== "fields") throw new Error("Missing summary fields");
      return Object.fromEntries(block.fields.map(field => [field.label, field.value]));
    };
    expect(summary()).toMatchObject({ Sessions: "2", Outcome: "Mixed (Resolved, Escalated)", "Session duration": "2m 0s" });
    data.transcript.raw.activities[2] = record("session-2");
    expect(summary().Outcome).toBe("Not recorded");
  });

  it("captures typed local component props, session-safe message selection and no raw transcript", () => {
    const data = input();
    data.transcript.turns[2].id = data.transcript.turns[0].id;
    data.transcript.turns[2].activities[0].id = data.transcript.turns[0].id;
    const before = JSON.stringify(data);
    const snapshot = buildAnalysisReport(data).offline;
    expect(snapshot?.exchanges).toHaveLength(2);
    expect(snapshot?.exchanges[0].messageId).not.toBe(snapshot?.exchanges[1].messageId);
    expect(snapshot?.exchanges.map(exchange => exchange.label)).toEqual(["Session 1 | Turn 1", "Session 2 | Turn 2"]);
    expect(snapshot?.transcriptData.activities.filter(activity => activity.type === "message")).toHaveLength(4);
    expect(snapshot?.generalSections?.map(section => section.heading)).toEqual(["Conversation summary", "Sessions"]);
    expect(JSON.stringify(snapshot)).not.toContain('"raw"');
    expect(JSON.stringify(data)).toBe(before);
  });

  it("captures the recorded reasoning statement without exporting raw inputs, results or orphan failures", () => {
    const data = input();
    data.componentNames["P:ReasonerTool"] = { name: "Reasoning", description: "PRIVATE-COMPONENT-DESCRIPTION",
      modelDisplayName: "", modelDescription: "PRIVATE-COMPONENT-MODEL", triggerQueries: ["PRIVATE-COMPONENT-QUERY"] };
    data.transcript.turns[0].debugInfo!.stepExecutions!.push({
      stepId: "private-call", taskDialogId: "P:ReasonerTool", state: 1, executionTime: "00:00:02",
      thought: "RECORDED-REASONING-STATEMENT", arguments: { secret: "PRIVATE-INPUT" }, observation: "PRIVATE-OUTPUT",
      errorMessage: "PRIVATE-ERROR",
    });

    data.transcript.turns[0].activities.push({ type: "event", name: "ToolCallTrace:Failed",
      value: { toolCallId: "orphan-reasoner", toolName: "P:ReasonerTool", errorMessage: "PRIVATE-ORPHAN" } });
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    const report = buildAnalysisReport(data);
    const snapshot = report.offline;
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE-");
    const reasoning = snapshot?.exchanges[0].turn.debugInfo?.stepExecutions?.find(step => step.taskDialogId === "P:ReasonerTool");
    expect(reasoning).toMatchObject({ state: 1, executionTime: "00:00:02" });
    expect(reasoning).not.toHaveProperty("arguments");
    expect(reasoning).not.toHaveProperty("observation");
    const model = buildWorkflowModel([snapshot!.exchanges[0].turn], snapshot!.componentNames, [], true);
    const reasonRows = model.turns[0].rows.filter(row => row.kind === "reason");
    expect(reasonRows.length).toBeGreaterThan(0);
    expect(reasonRows[0].node.offlineReasoning).toMatchObject({ name: "Reasoning",
      text: "RECORDED-REASONING-STATEMENT", status: "Completed", duration: "2.00 s" });
    expect(reasonRows[0].node.thought).toBeUndefined();
    const html = renderAnalysisHtml(report);
    for (const section of [/<template id="complete-evidence">([\s\S]*?)<\/template>/.exec(html)?.[1],
      /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1]]) {
      expect(section).toContain("RECORDED-REASONING-STATEMENT");
      expect(section).not.toContain("PRIVATE-");
    }
    expect(contents(report)).toContain("RECORDED-REASONING-STATEMENT");
  });

  it("preserves recorded offline reasoning ownership beneath an agent without restoring private triggers", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions = [
      { stepId: "agent-call", taskDialogId: "tenant.agent.Child", subtitle: "Child agent", state: 1 },
      { stepId: "nested-reason", taskDialogId: "P:ReasonerTool", state: 1,
        parentStepKey: "tenant.agent.Child:agent-call", planIdentifier: "child-plan",
        thought: "RECORDED-NESTED-STATEMENT", arguments: { secret: "PRIVATE-NESTED-INPUT" } },
    ];
    const snapshot = buildAnalysisReport(data).offline!;
    const model = buildWorkflowModel([snapshot.exchanges[0].turn], snapshot.componentNames, [], true);
    const agent = model.turns[0].rows.find(row => row.kind === "agent");
    if (agent?.kind !== "agent") throw new Error("Missing agent group");
    expect(agent.children).toHaveLength(1);
    expect(agent.children[0]).toMatchObject({ isReasoning: true,
      offlineReasoning: { name: "Reasoning", text: "RECORDED-NESTED-STATEMENT", status: "Completed" } });
    expect(model.turns[0].rows.filter(row => row.kind === "reason")).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE-NESTED");
  });

  it("restricts custom parent, child and raw-only reasoning component identities before HTML serialization", () => {
    const data = input();
    const taskIds = ["custom.action.Reason", "custom.action.RawReason", "child.action.Reason"];
    for (const task of taskIds) data.componentNames[task] = {
      name: task, description: "PRIVATE-CUSTOM-DESCRIPTION", modelDescription: "PRIVATE-CUSTOM-MODEL",
      triggerQueries: ["PRIVATE-CUSTOM-QUERY"], rawData: "PRIVATE-CUSTOM-YAML",
    };
    data.transcript.turns[0].debugInfo!.stepExecutions!.push({
      stepId: "custom-reason", taskDialogId: taskIds[0], subtitle: "Deep reasoning",
      arguments: { secret: "PRIVATE-CUSTOM-INPUT" }, observation: "PRIVATE-CUSTOM-RESULT", state: 1,
    });
    data.transcript.turns[0].activities.push({ type: "event", name: "ToolCallTrace:Failed",
      value: { toolCallId: "raw-reason", toolName: taskIds[1], subtitle: "Deep reasoning",
        errorMessage: "PRIVATE-CUSTOM-RAW-ERROR" } });
    data.transcript.turns[0].debugInfo!.stepExecutions!.push({
      stepId: "custom-raw-execution", taskDialogId: taskIds[1], state: 2,
      observation: "PRIVATE-RAW-IDENTITY-RESULT", errorMessage: "PRIVATE-RAW-IDENTITY-ERROR",
    });
    data.connectedAgents = [{
      agentKind: "connected", botSchemaName: "child", parentBotSchemaName: "parent",
      dialogSchemaName: "child", displayName: "Child", sessionId: "child-session", childConversationId: "child",
      parentReplyToId: data.transcript.turns[0].id, childTopics: [{
        displayName: "Reason", schemaId: taskIds[2], type: "Deep reasoning", stepId: "child-reason",
        thought: "RECORDED-CHILD-STATEMENT", observation: "PRIVATE-CHILD-TOPIC-RESULT",
      }], isFetched: true, isFetching: false,
      childTranscript: [{ id: "child-user", role: "user", content: "", timestamp: "", activities: [],
        debugInfo: { stepExecutions: [{ stepId: "child-reason", taskDialogId: taskIds[2],
          subtitle: "Deep reasoning", thought: "RECORDED-CHILD-STATEMENT", observation: "PRIVATE-CHILD-RESULT" }] } }],
    }];
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    const report = buildAnalysisReport(data);
    expect(JSON.stringify(report.offline)).not.toContain("PRIVATE-");
    expect(renderAnalysisHtml(report)).not.toContain("PRIVATE-");
    expect(report.offline!.exchanges[0].connectedAgents[0].childTopics[0].offlineReasoning?.text).toBe("RECORDED-CHILD-STATEMENT");
    expect(renderAnalysisHtml(report)).toContain("RECORDED-CHILD-STATEMENT");
    expect(report.offline!.exchanges[0].turn.debugInfo?.stepExecutions?.find(step =>
      step.taskDialogId === taskIds[0])?.subtitle).toBe("Deep reasoning");
  });

  it.each([false, true])("attaches captured children to their original exchange with repeated schema and step IDs=%s", repeatedSteps => {
    const data = input();
    const task = "tenant.action.InvokeConnectedAgentTaskAction";
    for (const index of [0, 1]) {
      data.transcript.turns[index * 2].debugInfo!.stepExecutions = [{
        stepId: repeatedSteps ? "same-call" : `call-${index}`, taskDialogId: task, type: "Action", state: 1,
      }];
    }
    data.connectedAgents = [0, 1].map(index => ({
      agentKind: "connected", botSchemaName: "same-child", parentBotSchemaName: "parent",
      dialogSchemaName: task, displayName: "Child", sessionId: `child-session-${index}`,
      childConversationId: `child-${index}`, parentReplyToId: data.transcript.turns[index * 2].id,
      ...(repeatedSteps ? { stepId: "same-call" } : {}),
      childTopics: [{ schemaId: `child.action.Tool${index}`, displayName: `CHILD-${index}`, type: "Action", stepId: `child-call-${index}` }],
      childTranscript: [{ id: `child-user-${index}`, role: "user", content: `CHILD-${index}`, timestamp: "", activities: [],
        debugInfo: { stepExecutions: [{ stepId: `child-call-${index}`, taskDialogId: `child.action.Tool${index}`, type: "Action", state: 1 }] } }],
      isFetched: true, isFetching: false,
    }));
    const snapshot = buildAnalysisReport(data).offline!;
    for (const index of [0, 1]) {
      const exchange = snapshot.exchanges[index];
      expect(exchange.connectedAgents).toHaveLength(1);
      expect(exchange.connectedAgents[0].childConversationId).toBe(`child-${index}`);
      const model = buildWorkflowModel([exchange.turn], snapshot.componentNames, exchange.connectedAgents, true);
      expect(JSON.stringify(model.turns)).toContain(`CHILD-${index}`);
      expect(JSON.stringify(model.turns)).not.toContain(`CHILD-${1 - index}`);
    }
  });

  it("preserves authoritative connector and flow classification without embedding raw component YAML", () => {
    const data = input();
    const tasks = ["tenant.action.LookupCustomer", "tenant.action.Office365-RunFlow"];
    for (const [index, task] of tasks.entries()) {
      data.componentNames[task] = { name: `Recorded tool ${index}`,
        rawData: `action:\n  kind: ${index ? "InvokeFlowTaskAction" : "InvokeConnectorTaskAction"}\nsecret: PRIVATE-RAW-YAML` };
      data.transcript.turns[index * 2].debugInfo!.stepExecutions = [{
        stepId: `classified-${index}`, taskDialogId: task, type: "Action", state: 1,
      }];
    }
    const snapshot = buildAnalysisReport(data).offline!;
    for (const index of [0, 1]) {
      const live = buildWorkflowModel([data.transcript.turns[index * 2]], data.componentNames);
      const offline = buildWorkflowModel([snapshot.exchanges[index].turn], snapshot.componentNames, [], true);
      expect(offline.turns[0].rows[0].node.subtitle).toBe(live.turns[0].rows[0].node.subtitle);
      expect(offline.turns[0].rows[0].node.flowStep?.subtitle).toBe(index ? "Flow" : "Connector Action");
    }
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE-RAW-YAML");
    expect(JSON.stringify(snapshot)).not.toContain("rawData");
  });

  it.each([false, true])("uses explicit child session evidence when original parent and call IDs repeat; explicit=%s", explicit => {
    const data = input();
    for (const index of [0, 1]) {
      const turn = data.transcript.turns[index * 2];
      turn.id = "same-parent";
      turn.activities[0].id = "same-parent";
      turn.debugInfo!.stepExecutions = [{ stepId: "same-call",
        taskDialogId: "tenant.action.InvokeConnectedAgentTaskAction", type: "Action", state: 1 }];
      if (explicit) turn.activities.push({ type: "trace", valueType: "ConnectedAgentInitializeTraceData",
        value: { sessionId: `child-${index}`, planStepId: "same-call" } });
    }
    data.connectedAgents = [0, 1].map(index => ({
      agentKind: "connected", botSchemaName: "child", parentBotSchemaName: "parent",
      dialogSchemaName: "tenant.action.InvokeConnectedAgentTaskAction", displayName: "Child",
      sessionId: `child-${index}`, childConversationId: `child-conversation-${index}`, parentReplyToId: "same-parent",
      stepId: "same-call", childTopics: [{ schemaId: `child.action.Marker${index}`, type: "Action", displayName: `CHILD-MARKER-${index}` }],
      isFetched: true, isFetching: false,
    }));
    const snapshot = buildAnalysisReport(data).offline!;
    for (const index of [0, 1]) {
      const owned = snapshot.exchanges[index].connectedAgents;
      expect(owned).toHaveLength(1);
      if (explicit) {
        expect(owned[0].childTopics[0].displayName).toBe(`CHILD-MARKER-${index}`);
      } else {
        expect(owned[0].childTopics).toEqual([]);
        expect(owned[0].isFetched).toBe(false);
        expect(owned[0].fetchError).toContain("Ambiguous");
      }
    }
  });

  it("keeps authoritative classification on activity-only fallback nodes and child topics", () => {
    const data = input();
    const task = "tenant.action.LookupCustomer";
    data.componentNames[task] = { name: "Connector", rawData: "action:\n  kind: InvokeConnectorTaskAction\nsecret: PRIVATE-YAML" };
    const turn = data.transcript.turns[0];
    turn.debugInfo = undefined;
    turn.activities.push({ type: "event", name: "DynamicPlanStepTriggered",
      value: { taskDialogId: task, stepId: "fallback", type: "Action" } });
    data.connectedAgents = [{
      agentKind: "connected", botSchemaName: "child", parentBotSchemaName: "parent",
      dialogSchemaName: "child", displayName: "Child", sessionId: "child-session", childConversationId: "child",
      parentReplyToId: turn.id, childTopics: [{ schemaId: task, type: "Action", displayName: "Connector" }],
      isFetched: true, isFetching: false,
    }];
    data.transcript.raw.activities = data.transcript.turns.flatMap(source => source.activities);
    const snapshot = buildAnalysisReport(data).offline!;
    expect(snapshot.exchanges[0].turn.debugInfo?.stepExecutions?.[0].subtitle).toBe("Connector Action");
    expect(snapshot.exchanges[0].connectedAgents[0].childTopics[0].type).toBe("Connector Action");
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE-YAML");
  });

  it("uses the actual workflow model with complete fallback inputs and captured diagnostics", () => {
    const data = input();
    const turn = data.transcript.turns[0];
    turn.debugInfo = undefined;
    turn.activities.push(
      { type: "event", name: "DynamicPlanStepTriggered", value: { taskDialogId: "test.action.lookup", stepId: "activity-only", type: "Action" } },
      { type: "event", name: "DynamicPlanStepBindUpdate", value: { taskDialogId: "test.action.lookup", stepId: "activity-only", arguments: { zero: 0, flag: false } } },
      { type: "event", name: "DynamicPlanStepFinished", value: { taskDialogId: "test.action.lookup", stepId: "activity-only", state: 1, observation: "FULL-FALLBACK-RESULT" } },
      { type: "trace", valueType: "ErrorTraceData", value: { errorCode: "ToolIdentifierConflict", errorMessage: "Recorded conflict", isUserError: false } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(source => source.activities);
    const snapshot = buildAnalysisReport(data).offline!;
    const captured = snapshot.exchanges[0];
    expect(captured.turn.debugInfo?.stepExecutions?.[0]).toMatchObject({
      arguments: { zero: 0, flag: false }, observation: "FULL-FALLBACK-RESULT",
    });
    const model = buildWorkflowModel([captured.turn], snapshot.componentNames, captured.connectedAgents, true);
    expect(model.turns[0].rows.some(row => row.node.title.includes("ToolIdentifierConflict"))).toBe(true);
    expect(model.turns[0].rows.some(row => row.node.title === "Lookup records")).toBe(true);
  });

  it("removes external image requests only from presentation props while keeping attachment evidence", () => {
    const data = input();
    data.transcript.turns[1].activities[0].attachments = [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: { type: "AdaptiveCard", body: [{ type: "Image", url: "https://invalid.example/private-image" },
        { type: "TextBlock", text: "CAPTURED-CARD-TEXT" }] },
    }];
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    const report = buildAnalysisReport(data);
    expect(JSON.stringify(report.offline)).not.toContain("https://invalid.example/private-image");
    expect(JSON.stringify(report.offline)).toContain("CAPTURED-CARD-TEXT");
    expect(JSON.stringify(report.sections)).toContain("https://invalid.example/private-image");
  });

  it("captures startup messages, repeated exchange IDs and complete wrapper siblings", () => {
    const data = input();
    data.transcript.turns.unshift({ id: "welcome", role: "assistant", content: "STARTUP-WELCOME",
      timestamp: "", activities: [{ type: "message", id: "welcome", mergedSessionKey: "session-1" }] });
    const original = data.transcript.turns[1];
    original.debugInfo!.stepExecutions![0].observation = {
      agent_response: "Readable", content: [{ type: "image", data: "RECORDED-IMAGE-DATA" }],
      sibling: { zero: 0, flag: false, value: "WRAPPER-SIBLING" },
    };
    data.transcript.turns.splice(3, 0, { ...original, content: "SECOND-SAME-ID",
      activities: [...original.activities], debugInfo: structuredClone(original.debugInfo) });
    const before = JSON.stringify(data);
    const html = buildAnalysisReport(data);
    const text = JSON.stringify(html);
    for (const marker of ["STARTUP-WELCOME", "SECOND-SAME-ID", "WRAPPER-SIBLING", "RECORDED-IMAGE-DATA", '\\"flag\\": false', '\\"zero\\": 0']) {
      expect(text).toContain(marker);
    }
    expect(html.sections.flatMap(s => s.blocks).filter(b => b.kind === "exchange")).toHaveLength(4);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("labels session/exchange scoped observed evidence, completion-only and ambiguous calls without inferring success", () => {
    const data = input();
    for (const [index, marker] of [[0, "FIRST"], [2, "SECOND"]] as const) {
      const turn = data.transcript.turns[index];
      turn.debugInfo!.stepExecutions![0].stepId = "shared-call";
      turn.activities.push({ type: "event", name: "ToolCallTrace:Completed", timestamp: "2026-11-04T10:01:01Z",
        value: { toolCallId: "shared-call", result: marker, durationMs: 0, httpStatusCode: 0, errorCode: false } });
    }
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const report = buildAnalysisReport(data);
    const flows = report.sections.flatMap(s => s.blocks).filter(b => b.kind === "exchange");
    expect(flows[0].steps[1].observedEvidence).toMatchObject({
      toolCallId: "shared-call", correlationQuality: "completion-only", recordedDuration: "0", httpStatus: "0", errorCode: "false",
    });
    expect(JSON.stringify(flows[0])).not.toContain("SECOND");
    data.transcript.turns[0].activities.push({ ...data.transcript.turns[0].activities[1] });
    const ambiguous = buildAnalysisReport(data);
    expect(JSON.stringify(ambiguous)).toContain('"correlationQuality":"ambiguous"');
  });

  it("provides an inspectable classic error node without executions, preserving safe diagnostics and variable scope", () => {
    const data = input();
    const turn = data.transcript.turns[0];
    turn.debugInfo = undefined;
    turn.activities.push(
      { type: "trace", valueType: "ErrorTraceData", timestamp: "2026-11-04T10:01:00Z",
        value: { errorCode: "ToolIdentifierConflict", errorMessage: "Recorded conflict", isUserError: false } },
      { type: "trace", valueType: "VariableAssignment", value: { name: "CurrentTime", type: "local", newValue: 0 } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const report = buildAnalysisReport(data);
    const exchange = report.sections.flatMap(s => s.blocks).find(b => b.kind === "exchange");
    expect(exchange).toMatchObject({ kind: "exchange" });
    if (exchange?.kind !== "exchange") throw new Error("Missing exchange");
    expect(exchange.steps.some(s => s.heading.includes("ToolIdentifierConflict"))).toBe(true);
    expect(exchange.steps.some(s => s.heading.includes("Scope: local"))).toBe(true);
    expect(JSON.stringify(exchange)).toContain('\\"isUserError\\": false');
    expect(JSON.stringify(exchange)).not.toContain('"httpStatus"');
  });

  it("filters nested reasoning from readable and complete evidence while retaining unrelated siblings", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions![0].observation = {
      content: [{ type: "text", text: JSON.stringify({ taskDialogId: "P:ReasonerTool",
        thought: "PRIVATE-NESTED-THOUGHT", result: "PRIVATE-NESTED-RESULT", state: 1 }) }],
      sibling: false, thought: "PRIVATE-ROOT-THOUGHT",
    };
    const report = buildAnalysisReport(data);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("PRIVATE-");
    expect(serialized).toContain('\\"sibling\\": false');
    expect(renderAnalysisHtml(report)).not.toContain("PRIVATE-");
  });

  it("preserves complete ordinary JSON-string leaves instead of replacing their recorded representation", () => {
    const data = input();
    const leaf = JSON.stringify({ results: [{ summary: `${"Long recorded summary ".repeat(200)}JSON-STRING-TAIL`,
      values: [0, false] }], wrapperSibling: "SIBLING" });
    const privateLeaf = JSON.stringify({ MatchedRoles: [{ Reasoning: "PRIVATE-MATCH-RATIONALE", Role: "RECORDED-ROLE" }] });
    data.transcript.turns[0].debugInfo!.stepExecutions![0].observation = { resumesummary: leaf, evaluatedRoles: privateLeaf };
    const captured = buildAnalysisReport(data);
    const codes = captured.sections.flatMap(s => contentBlocks(s.blocks)).flatMap(b => b.kind === "code" ? [b.text] : []);
    expect(codes.some(code => code.includes(JSON.stringify(leaf)))).toBe(true);
    expect(JSON.stringify(captured)).not.toContain("PRIVATE-MATCH-RATIONALE");
    expect(JSON.stringify(captured)).toContain("RECORDED-ROLE");
    expect(renderAnalysisHtml(captured)).toContain("JSON-STRING-TAIL");
  });

  it("keeps ordinary errors when a different exchange reuses a reasoning call ID", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions = [
      { stepId: "reused", taskDialogId: "P:ReasonerTool", subtitle: "Deep reasoning", errorMessage: "PRIVATE-ERROR" },
    ];
    const ordinary = data.transcript.turns[2];
    ordinary.activities[0].mergedSessionKey = "session-1";
    data.transcript.turns[3].activities[0].mergedSessionKey = "session-1";
    ordinary.debugInfo!.stepExecutions![0].stepId = "reused";
    ordinary.activities.push({ type: "trace", valueType: "ErrorTraceData",
      value: { toolCallId: "reused", errorCode: "VisibleDenied", errorMessage: "VISIBLE-REUSED-ERROR" } });
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const report = buildAnalysisReport(data);
    expect(JSON.stringify(report)).not.toContain("PRIVATE-");
    expect(JSON.stringify(report)).toContain("VISIBLE-REUSED-ERROR");
  });

  it("labels orphan completion evidence and keeps orphan reasoning metadata-only", () => {
    const data = input();
    data.transcript.turns[0].activities.push(
      { type: "event", name: "ToolCallTrace:Completed", value: { toolCallId: "orphan",
        result: false, toolCategory: "mcp", toolKind: "tool", durationMs: 0 } },
      { type: "event", name: "ToolCallTrace:Failed", value: { toolCallId: "orphan-reason",
        toolName: "P:ReasonerTool", result: "PRIVATE-ORPHAN-RESULT", errorCode: "PRIVATE-ORPHAN-CODE",
        errorMessage: "PRIVATE-ORPHAN-ERROR", durationMs: 0 } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const report = buildAnalysisReport(data);
    const serialized = JSON.stringify(report);
    expect(serialized).toContain('"correlationQuality":"completion-only"');
    expect(serialized).toContain('"toolCategory":"mcp"');
    expect(serialized).not.toContain("PRIVATE-");
    expect(renderAnalysisHtml(report)).not.toContain("PRIVATE-");
  });

  it("does not present classic execution IDs as observed tool calls and finds completion-only query values", () => {
    const data = input();
    const classic = buildAnalysisReport(data).sections.flatMap(s => s.blocks).find(b => b.kind === "exchange");
    if (classic?.kind !== "exchange") throw new Error("Missing exchange");
    expect(classic.steps[1].observedEvidence?.toolCallId).toBeUndefined();
    expect(classic.steps[1].observedEvidence?.correlationQuality).toBe("missing");
    for (const query of [0, false, "RECORDED-QUERY"]) {
      data.transcript.turns[0].activities.push({ type: "event", name: "ToolCallTrace:Completed",
        value: { toolCallId: "step-1", filledParameters: { query }, result: false } });
      data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
      const flow = buildAnalysisReport(data).sections.flatMap(s => s.blocks).find(b => b.kind === "exchange");
      if (flow?.kind !== "exchange") throw new Error("Missing exchange");
      expect(flow.steps[1].observedEvidence).toMatchObject({ queryAvailability: "recorded", correlationQuality: "completion-only" });
      data.transcript.turns[0].activities.pop();
    }
  });

  it.each([false, true])("captures activity-only classic fallback with reasoning=%s privacy", reasoning => {
    const data = input();
    const turn = data.transcript.turns[0];
    turn.debugInfo = undefined;
    const taskDialogId = reasoning ? "P:ReasonerTool" : "test.action.lookup";
    turn.activities.push(
      { type: "event", name: "DynamicPlanStepTriggered", timestamp: "2026-11-04T10:01:00Z",
        value: { taskDialogId, stepId: "fallback", thought: "PRIVATE-FALLBACK-THOUGHT" } },
      { type: "event", name: "DynamicPlanStepBindUpdate", value: {
        taskDialogId, stepId: "fallback", arguments: { zero: 0, flag: false, value: reasoning ? "PRIVATE-FALLBACK-INPUT" : "FALLBACK-INPUT" } } },
      { type: "event", name: "DynamicPlanStepFinished", timestamp: "2026-11-04T10:01:02Z",
        value: { taskDialogId, stepId: "fallback", state: 1, sibling: "FALLBACK-SIBLING",
          observation: reasoning ? "PRIVATE-FALLBACK-RESULT" : `${"Long result ".repeat(1000)}FALLBACK-LONG-TAIL` } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const captured = buildAnalysisReport(data);
    const text = JSON.stringify(captured);
    expect(text).not.toContain("PRIVATE-");
    if (reasoning) {
      expect(text).not.toContain("FALLBACK-SIBLING");
      expect(captured.sections.flatMap(s => s.blocks).filter(b => b.kind === "exchange")
        .some(b => b.steps.some(s => s.category === "reasoning"))).toBe(true);
    } else {
      for (const value of ["FALLBACK-INPUT", "FALLBACK-LONG-TAIL", "FALLBACK-SIBLING", '\\"zero\\": 0', '\\"flag\\": false']) expect(text).toContain(value);
    }
  });

  it("retains loaded child attachment and feedback evidence in complete and no-script content", () => {
    const data = input();
    data.connectedAgents = [{
      agentKind: "connected", botSchemaName: "child", sessionId: "child-session", parentBotSchemaName: "parent",
      dialogSchemaName: "child", displayName: "Child", childConversationId: "child-conversation",
      childTopics: [], isFetched: true, isFetching: false,
      childTranscript: [{ id: "child-msg", role: "assistant", content: "Child answer", timestamp: "2026-11-04T10:01:02Z",
        feedback: { rating: "thumbsUp", comment: "CHILD-FEEDBACK" }, activities: [{
          id: "child-msg", type: "message", attachments: [{ content: { text: `${"Long attachment ".repeat(500)}CHILD-ATTACHMENT-TAIL` } }],
        }] }],
    }];
    const captured = buildAnalysisReport(data);
    const html = renderAnalysisHtml(captured);
    const complete = /<template id="complete-evidence">([\s\S]*?)<\/template>/.exec(html)?.[1] ?? "";
    const fallback = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
    for (const text of [JSON.stringify(captured), complete, fallback]) {
      expect(text).toContain("CHILD-ATTACHMENT-TAIL");
      expect(text).toContain("CHILD-FEEDBACK");
      expect(text).toContain("child-msg");
    }
  });

  it.each([false, true])("scopes classic and generative failures with reused IDs (same session=%s)", sameSession => {
    const data = input();
    if (sameSession) {
      for (const turn of data.transcript.turns.slice(2)) turn.activities[0].mergedSessionKey = "session-1";
    }
    for (const [index, marker] of [[0, "FIRST-ERROR"], [2, "SECOND-ERROR"]] as const) {
      const turn = data.transcript.turns[index];
      turn.id = "repeated-user";
      turn.activities[0].id = "repeated-user";
      turn.debugInfo!.stepExecutions![0].stepId = "repeated-call";
      turn.activities.push(
        { id: "same-failure", type: "event", name: "DynamicPlanStepFinished", replyToId: "repeated-user",
          value: { taskDialogId: "test.action.lookup", stepId: "repeated-call", state: 2 } },
        { id: "same-diagnostic", type: "trace", valueType: "ErrorTraceData", replyToId: "repeated-user",
          value: { errorCode: "Denied", errorMessage: marker } },
        { type: "event", name: "ToolCallTrace:Failed", value: { toolCallId: "repeated-call", toolName: "Lookup", errorMessage: marker } },
      );
    }
    data.transcript.raw.activities = data.transcript.turns.flatMap(t => t.activities);
    const trace = buildAnalysisReport(data).sections.find(s => s.heading === "Tool call trace")!;
    const text = JSON.stringify(trace);
    expect(text).toContain("FIRST-ERROR");
    expect(text).toContain("SECOND-ERROR");
    expect(text).toContain("Session 1 | Turn 1");
    const secondScope = `Session ${sameSession ? 1 : 2} | Turn 2`;
    expect(text).toContain(secondScope);
    expect(JSON.stringify(trace.blocks[0])).toContain("FIRST-ERROR");
    expect(JSON.stringify(trace.blocks[0])).not.toContain("SECOND-ERROR");
    expect(JSON.stringify(trace.blocks[1])).toContain("SECOND-ERROR");
    expect(JSON.stringify(trace.blocks[1])).not.toContain("FIRST-ERROR");
  });

  it("groups prompts through final responses with skills and safe recorded reasoning in order", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions!.unshift(
      { stepId: "reason", taskDialogId: "GEN:ThinkingTrace", subtitle: "Chain of thought", state: 1,
        executionTime: "00:00:02", thought: "RECORDED-REASONING-TEXT", arguments: { secret: "REASONING-INPUT" },
        observation: "REASONING-OUTPUT" },
      { stepId: "skill", taskDialogId: "skill.lookup", subtitle: "Skill", state: 1,
        arguments: { skill: "RECORDED-SKILL-INPUT" }, observation: "RECORDED-SKILL-OUTPUT" },
    );
    const before = JSON.stringify(data);
    const report = buildAnalysisReport(data);
    const trace = report.sections.find(section => section.heading === "Tool call trace")!;
    expect(trace.blocks[0]).toMatchObject({ kind: "exchange", steps: [
      { category: "prompt" }, { category: "reasoning" }, { category: "skill" },
      { category: "tool" }, { category: "response" },
    ] });
    const text = contents(report);
    for (const marker of ["RECORDED-SKILL-INPUT", "RECORDED-SKILL-OUTPUT", "Duration: 2.00 s", "Session 1 answer"]) expect(text).toContain(marker);
    expect(text).toContain("RECORDED-REASONING-TEXT");
    for (const marker of ["REASONING-INPUT", "REASONING-OUTPUT"]) expect(text).not.toContain(marker);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("keeps prompt/response-only exchanges instead of skipping the next prompt", () => {
    const data = input();
    data.transcript.turns[0].debugInfo = undefined;
    const trace = buildAnalysisReport(data).sections.find(section => section.heading === "Tool call trace")!;
    expect(trace.blocks).toHaveLength(2);
    expect(trace.blocks[0]).toMatchObject({ kind: "exchange", steps: [{ category: "prompt" }, { category: "response" }] });
  });

  it("uses compact boxes for skills and reasoning without recorded details, preserving zero and false results", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions = [
      { stepId: "empty-skill", taskDialogId: "skill.empty", subtitle: "Skill", arguments: {} },
      { stepId: "empty-reason", taskDialogId: "GEN:ThinkingTrace", subtitle: "Thinking" },
      { stepId: "zero-skill", taskDialogId: "skill.zero", subtitle: "Skill", executionTime: "00:00:00", observation: 0 },
      { stepId: "false-skill", taskDialogId: "skill.false", subtitle: "Skill", observation: false },
    ];
    const trace = buildAnalysisReport(data).sections.find(section => section.heading === "Tool call trace")!;
    const exchange = trace.blocks[0];
    expect(exchange.kind).toBe("exchange");
    if (exchange.kind !== "exchange") throw new Error("Expected an exchange.");
    expect(exchange.steps[1]).toMatchObject({ category: "skill" });
    expect(exchange.steps[1].blocks.some(block => block.kind === "heading" && block.text === "Input passed to skill")).toBe(false);
    expect(exchange.steps[2]).toMatchObject({ category: "reasoning", blocks: [] });
    expect(exchange.steps[3]).toMatchObject({ category: "skill" });
    expect(JSON.stringify(exchange.steps[3].blocks)).toContain("0 ms");
    expect(JSON.stringify(exchange.steps[3].blocks)).toContain('"text":"0"');
    expect(JSON.stringify(exchange.steps[4].blocks)).toContain('"text":"false"');
    expect(JSON.stringify(exchange.steps[1])).not.toContain("Not recorded");
  });

  it.each(["user", "assistant", "assistant-unattributed", "later-assistant"] as const)(
    "keeps %s-owned reasoning errors out of HTML export, preserving ordinary tool errors", location => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions!.unshift({
      stepId: "reason", taskDialogId: "P:ReasonerTool", subtitle: "Deep reasoning", state: 2,
      thought: "RECORDED-REASONING-STATEMENT", errorMessage: "PRIVATE-REASONING-ERROR",
      arguments: { secret: "PRIVATE-ARGUMENT" }, observation: "PRIVATE-OBSERVATION",
    });
    data.transcript.turns[0].debugInfo!.stepExecutions![1].errorMessage = "VISIBLE-TOOL-ERROR";
    const diagnostic = {
      id: "ambiguous-error", type: "trace", valueType: "ErrorTraceData",
      replyToId: location === "assistant-unattributed" ? undefined : "user-1",
      value: { errorCode: "PRIVATE-CODE", errorMessage: "PRIVATE-AMBIGUOUS-ERROR" },
    };
    if (location === "later-assistant") {
      for (const turn of data.transcript.turns.slice(2)) {
        for (const activity of turn.activities) activity.mergedSessionKey = "session-1";
      }
    }
    const owner = location === "user" ? 0 : location === "later-assistant" ? 3 : 1;
    data.transcript.turns[owner].activities.unshift(diagnostic);
    data.transcript.turns[1].activities.unshift({
      id: "correlated-error", type: "trace", valueType: "ErrorTraceData", replyToId: "user-1",
      value: { toolCallId: "step-1", errorCode: "ToolDenied", errorMessage: "VISIBLE-CORRELATED-ERROR" },
    });
    data.transcript.turns[0].activities.push(
      { id: "reason-failed", type: "event", name: "DynamicPlanStepFinished", replyToId: "user-1",
        value: { taskDialogId: "P:ReasonerTool", stepId: "reason", state: 2, error: { message: "PRIVATE-EMBEDDED-ERROR" } } },
      { id: "reason-tool-failed", type: "event", name: "ToolCallTrace:Failed",
        value: { toolCallId: "reason", errorMessage: "PRIVATE-GENERATIVE-ERROR" } },
      { id: "tool-failed", type: "event", name: "DynamicPlanStepFinished", replyToId: "user-1",
        value: { taskDialogId: "test.action.lookup", stepId: "step-1", state: 2, error: { message: "VISIBLE-TOOL-ERROR" } } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    const before = JSON.stringify(data);
    const report = buildAnalysisReport(data);
    const outputs = [contents(report), renderAnalysisHtml(report)];
    for (const output of outputs) {
      expect(output).not.toContain("PRIVATE-");
      expect(output).toContain("VISIBLE-TOOL-ERROR");
      expect(output).toContain("VISIBLE-CORRELATED-ERROR");
    }
    expect(JSON.stringify(data)).toBe(before);
  });

  it("includes both sessions, messages, resolved step names and payloads", () => {
    const report = buildAnalysisReport(input(), new Date("2026-11-04T12:00:00Z"));
    const text = contents(report);
    for (const value of ["Session 1 question", "Session 2 answer", "Lookup records", "query-2", "result-1"]) {
      expect(text).toContain(value);
    }
    expect(text).toContain("Not recorded");
    expect(text).toContain("2026-11-04T12:00:00.000Z");
    expect(report.filename).toBe("agent-debugger-conversation_unsafe_name.html");
  });

  it("captures loaded children and explicit incomplete states without retaining mutable references", () => {
    const data = input();
    const child: ConnectedAgentInfo = {
      agentKind: "connected", botSchemaName: "child", sessionId: "child-session",
      parentBotSchemaName: "parent", dialogSchemaName: "invoke-child", displayName: "Child agent",
      childConversationId: "child-conversation", childTopics: [], isFetched: true, isFetching: false,
      childTranscript: [{ id: "child-reply", role: "assistant", content: "Child response", timestamp: "", activities: [],
        debugInfo: { stepExecutions: [{ stepId: "child-tool", taskDialogId: "child.action.lookup", state: 1 }] } }],
    };
    data.connectedAgents = [
      child, { ...child, sessionId: "pending", isFetched: false, isFetching: true, childTranscript: undefined },
      { ...child, sessionId: "failed", isFetched: false, fetchError: "Access denied", childTranscript: undefined },
      { ...child, sessionId: "missing", isFetched: false, childTranscript: undefined },
    ];
    const report = buildAnalysisReport(data);
    child.childTranscript![0].content = "Changed after capture";
    const text = contents(report);
    expect(text).toContain("Child response");
    expect(text).not.toContain("Changed after capture");
    expect(text).toContain("Still loading");
    expect(text).toContain("Access denied");
    expect(text).toContain("Not loaded");
    const availability = report.sections.find(section => section.heading === "Connected agent availability")!;
    expect(availability.blocks[0]).toMatchObject({ kind: "table", rows: [
      ["1", "Child agent", "Loaded"], ["2", "Child agent", "Still loading at capture time"],
      ["3", "Child agent", "Failed to load: Access denied"], ["4", "Child agent", "Not loaded"],
    ] });
  });

  it("retains startup tool work, attachments and session-local repeated call ids", () => {
    const data = input();
    data.transcript.turns[2].debugInfo!.stepExecutions![0].stepId = "step-1";
    data.transcript.turns.unshift({
      id: "startup", role: "assistant", content: "[Adaptive Card Message]", timestamp: "",
      activities: [{ id: "startup", type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { body: [{ text: "Card title" }] } }] }],
      debugInfo: { stepExecutions: [{ stepId: "start", taskDialogId: "startup.tool", observation: "STARTUP-RESULT" }] },
    });
    const text = contents(buildAnalysisReport(data));
    expect(text).toContain("STARTUP-RESULT");
    expect(text).toContain("Card title");
    expect(text).toContain("result-1");
    expect(text).toContain("result-2");
  });

  it("formats diagnostic payloads separately without losing metadata", () => {
    const report = buildAnalysisReport(input());
    const execution = report.sections.find(section => section.heading === "Tool call trace")!;
    expect(contents(report)).toContain("result-1");
    expect(contentBlocks(execution.blocks).some(block => block.kind === "heading" && block.text === "Result returned")).toBe(true);
  });

  it("unwraps readable tool output once instead of repeating raw protocol envelopes", () => {
    const data = input();
    data.transcript.turns[0].debugInfo!.stepExecutions![0].observation = {
      content: [{ type: "text", text: "**Readable tool response**\n| Name | Value |\n|---|---|\n| Result | Complete |" }],
      opaque: { reference: "RAW-DIAGNOSTIC-MARKER" },
    };
    const section = buildAnalysisReport(data).sections.find(section => section.heading === "Tool call trace")!;
    expect(contentBlocks(section.blocks).some(block => block.kind === "markdown" && block.text.includes("Readable tool response"))).toBe(true);
    expect(contents(buildAnalysisReport(data))).toContain("RAW-DIAGNOSTIC-MARKER");
  });

  it("does not label missing response/session timing as zero, but preserves recorded zero", () => {
    const data = input();
    data.transcript.turns = [{ id: "user", role: "user", content: "Question", timestamp: "2026-11-04T10:00:00Z",
      activities: [{ id: "user", type: "message", timestamp: "2026-11-04T10:00:00Z", from: { role: 1 } }] }];
    data.transcript.raw.activities = data.transcript.turns[0].activities;
    data.sessions = [{ n: 1, startText: "", durationMs: 0, type: "", outcome: "", turnCount: 1, turnText: "1 turn" }];
    expect(contents(buildAnalysisReport(data))).toContain("Question");
    expect(contents(buildAnalysisReport(data))).not.toContain("Duration: 0 ms");
    data.transcript.turns[0].debugInfo = { stepExecutions: [{
      taskDialogId: "test", stepId: "zero", executionTime: "00:00:00", state: 1,
    }] };
    expect(contents(buildAnalysisReport(data))).toContain("Duration: 0 ms");
  });

  it("keeps numbering aligned with metadata-only sessions", () => {
    const data = input();
    data.transcript.turns = data.transcript.turns.slice(2);
    data.transcript.raw.activities = [
      { type: "trace", valueType: "SessionInfo", mergedSessionKey: "session-1", value: { turnCount: 0 } },
      { type: "trace", valueType: "SessionInfo", mergedSessionKey: "session-2", value: { turnCount: 1 } },
      ...data.transcript.turns.flatMap((turn) => turn.activities),
    ];
    const report = contents(buildAnalysisReport(data));
    expect(report).toContain("Session 2 | Turn");
    expect(report).not.toContain("Session 1 | Turn");
  });

  it("removes requested summary content and keeps raw source data unchanged", () => {
    const data = input();
    const original = JSON.stringify(data);
    const report = contents(buildAnalysisReport(data));
    expect(report).not.toContain("Source:");
    expect(report).not.toContain("Recorded tokens:");
    expect(report).not.toContain("Contains conversation and diagnostic data");
    expect(JSON.stringify(data)).toBe(original);
  });

  it("reads hidden tool queries and explicit HTTP/error evidence without inventing missing status codes", () => {
    const data = input();
    const activities = data.transcript.turns[0].activities;
    activities.push(
      { type: "event", name: "ToolCallTrace:Started", value: { toolCallId: "step-1", hiddenFilledParameters: { body: { query: "SELECT SAMPLE" } } } },
      { type: "event", name: "ToolCallTrace:Failed", value: { toolCallId: "step-1", errorCode: "Denied", errorMessage: "Access denied", httpStatusCode: 403 } },
    );
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    const report = contents(buildAnalysisReport(data));
    expect(report).toContain("SELECT SAMPLE");
    expect(report).toContain("HTTP status: 403");
    expect(report).toContain("Error code: Denied");
    expect(report.match(/HTTP status:/g)).toHaveLength(1);
  });

  it("does not let empty hidden parameters conceal recorded tool inputs", () => {
    const data = input();
    data.transcript.turns[0].activities.push({ type: "event", name: "ToolCallTrace:Started",
      value: { toolCallId: "step-1", filledParameters: { query: "RECORDED-QUERY" }, hiddenFilledParameters: {} } });
    data.transcript.raw.activities = data.transcript.turns.flatMap(turn => turn.activities);
    expect(contents(buildAnalysisReport(data))).toContain("RECORDED-QUERY");
  });

  it("renders nested MCP result tables while preserving multiline Markdown and incomplete source evidence", () => {
    const markdown = "**Result**\n| Item | Value |\n|---|---|\n| One | Complete |";
    expect(reportEvidence({ content: [{ type: "text", text: markdown }] })).toEqual([{ kind: "markdown", text: markdown }]);
    const result = reportEvidence(JSON.stringify({ content: [{ type: "text", text: 'Rows: {"columns":["Name","Count"],"rows":[["Sample",42]]}' }] }));
    expect(result).toContainEqual({ kind: "table", columns: ["Name", "Count"], rows: [["Sample", "42"]] });
    expect(reportEvidence('Results:\n[\n{"Name":"Sample","Count":42}\n]')).toContainEqual({
      kind: "table", columns: ["Name", "Count"], rows: [["Sample", "42"]],
    });
    expect(reportEvidence('{"content": [ (truncated)')).toEqual([{ kind: "code", text: '{"content": [ (truncated)' }]);
  });

  it("hides protocol result identifiers and titles without losing results or answer citations", () => {
    const output = reportEvidence('Title: RAW-TITLE-SNIPPET\nReferenceId: turn1doc1\n[{"Name":"Sample","Count":42}]');
    expect(output).toContainEqual({ kind: "table", columns: ["Name", "Count"], rows: [["Sample", "42"]] });
    expect(JSON.stringify(output)).not.toContain("turn1doc1");
    expect(JSON.stringify(output)).not.toContain("Result reference:");
    expect(JSON.stringify(output)).not.toContain("RAW-TITLE-SNIPPET");
    const response = reportEvidence('**Answer** [1]\n\n[1]: cite:1 "RAW-CITATION-SNIPPET"');
    expect(response).toEqual([{ kind: "markdown", text: "**Answer** [1] (Recorded tool references: [1] (cite:1))" }]);
    expect(JSON.stringify(response)).not.toContain("RAW-CITATION-SNIPPET");
    expect(reportEvidence('[1]: cite:1 "RAW-CITATION-SNIPPET"')).toEqual([
      { kind: "text", text: "Recorded tool references: [1] (cite:1)" },
    ]);
    expect(reportEvidence('| Name | Count |\n|---|---|\n| Sample | 42 |\n[1]: cite:1 "Title"')).toEqual([
      { kind: "markdown", text: "| Name | Count |\n|---|---|\n| Sample | 42 |" },
      { kind: "text", text: "Recorded tool references: [1] (cite:1)" },
    ]);
    expect(reportEvidence("Title: Only recorded evidence\nReferenceId: turn1doc1")).toEqual([
      { kind: "markdown", text: "Title: Only recorded evidence\nReferenceId: turn1doc1" },
    ]);
  });
});
