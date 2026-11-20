import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({
  root: fileURLToPath(new URL('../../../../../', import.meta.url)),
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ['@microsoft/power-apps'] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
after(() => server.close());
const basePath = '/src/features/agent-debugger';
const { parseTranscript } = await server.ssrLoadModule(`${basePath}/utils/transcript/parse-transcript.ts`);
const { activitiesForUserTurn, isUserMessageActivity } = await server.ssrLoadModule(`${basePath}/utils/transcript/turn-activities.ts`);
const { turnTimeBounds, unattributedIntervals, hasStepTiming } = await server.ssrLoadModule(`${basePath}/utils/turn-timing.ts`);
const { buildWorkflowModel } = await server.ssrLoadModule(`${basePath}/components/flow/WorkflowCanvasModel.ts`);
const { turnDurationMs } = await server.ssrLoadModule(`${basePath}/utils/timeline-insights.ts`);
const { ActivityDetailPane } = await server.ssrLoadModule(`${basePath}/components/conversation/ActivityDetailPane.tsx`);
const epoch = Date.parse('2026-01-01T00:00:00Z');

function activity(offset, type, extra = {}) {
  return { type, timestamp: Math.floor((epoch + offset) / 1000), timestampMs: epoch + offset, from: { role: 0 }, ...extra };
}
function event(offset, name, value = {}, replyToId = 'question') {
  return activity(offset, 'event', { name, value, replyToId });
}
function renderedState(fields) {
  const exec = { taskDialogId: 'test.component.Profile', stepId: 'profile', ...fields };
  const turn = { id: 'greeting', role: 'assistant', content: 'Hello', timestamp: '', activities: [], debugInfo: { stepExecutions: [exec] } };
  const selectedNode = { id: 'greeting:test.component.Profile:profile', title: 'Profile', subtitle: 'Step', failed: false, turnNumber: 0 };
  const markup = renderToStaticMarkup(createElement(ActivityDetailPane, { turn, selectedNode, onClearSelection() {} }));
  const label = markup.match(/>State<\/dt><dd[^>]*><span[^>]*>([^<]*)<\/span>/)?.[1];
  assert.ok(label, 'The details pane must render an execution state');
  return label;
}

test('does not present missing or blank execution state as successfully completed', () => {
  for (const fields of [{}, { state: '' }, { state: '   ', finishedAt: new Date(epoch).toISOString() }]) {
    assert.equal(renderedState(fields), 'Unknown');
  }
});

test('preserves reported execution states and explicit failures', () => {
  assert.equal(renderedState({ state: 'completed' }), 'Completed');
  assert.equal(renderedState({ state: 1 }), 'Completed');
  assert.equal(renderedState({ state: 0 }), 'Running');
  assert.equal(renderedState({ errorMessage: 'Synthetic action failure' }), 'Failed');
});

function fixture({ preQuestion, searchStart, searchEnd, ticketStart, ticketEnd, reply, completion }) {
  return { activities: [
    event(-preQuestion - 400, 'startConversation', {}, 'startup'),
    event(-preQuestion, 'DynamicPlanStepBindUpdate', { taskDialogId: 'test.component.Profile', arguments: {} }, 'startup'),
    activity(-preQuestion + 500, 'message', { id: 'greeting', text: 'Hello', replyToId: 'startup' }),
    activity(0, 'message', { id: 'question', text: 'Question', from: { role: 1 } }),
    event(searchStart, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Search-Run', stepId: 'search', type: 'Action' }),
    event(searchEnd, 'DynamicPlanStepFinished', { taskDialogId: 'test.action.Search-Run', stepId: 'search', executionTime: `00:00:${((searchEnd - searchStart) / 1000).toFixed(7)}`, state: 'completed' }),
    event(ticketStart, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Ticket-Create', stepId: 'ticket', type: 'Action' }),
    event(ticketEnd, 'DynamicPlanStepFinished', { taskDialogId: 'test.action.Ticket-Create', stepId: 'ticket', executionTime: `00:00:${((ticketEnd - ticketStart) / 1000).toFixed(7)}`, state: 'completed' }),
    activity(reply, 'message', { id: 'answer', text: 'Answer', replyToId: 'question' }),
    event(completion, 'DynamicPlanFinished'),
    activity(completion + 25000, 'message', { id: 'followup', text: 'Follow up', from: { role: 1 } }),
    event(completion + 27000, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Ticket-Update', stepId: 'update', type: 'Action' }, 'followup'),
    activity(completion + 28000, 'message', { id: 'prompt', text: 'Provide the description', replyToId: 'followup' }),
  ] };
}

for (const example of [
  { preQuestion: 15180, searchStart: 2785, searchEnd: 3774, ticketStart: 7211, ticketEnd: 12656, reply: 17223, completion: 17226 },
  { preQuestion: 14015, searchStart: 2196, searchEnd: 3108, ticketStart: 5145, ticketEnd: 12923, reply: 16600, completion: 16604 },
]) {
  test(`separates startup and user think time for the ${example.reply} ms response`, () => {
    const parsed = parseTranscript(fixture(example));
    const [greeting, question] = parsed.turns;
    assert.equal(greeting.role, 'assistant');
    assert.equal(greeting.debugInfo.stepExecutions.length, 1);
    assert.equal(hasStepTiming(greeting.debugInfo.stepExecutions[0]), false);
    assert.equal(greeting.activities.filter((a) => a.name === 'DynamicPlanStepBindUpdate').length, 1);
    assert.equal(question.debugInfo.stepExecutions.length, 2);
    const workflow = buildWorkflowModel(parsed.turns);
    assert.deepEqual(workflow.turns.map((turn) => turn.turnNumber), [0, 1, 2]);
    assert.equal(workflow.turns[0].rows[0].node.duration, 'Unknown');
    assert.equal(workflow.turns[1].durationMs, example.completion);
    assert.equal(workflow.turns[2].durationMs, 3000);
    assert.equal(workflow.turns[2].rows[0].node.duration, 'Unknown');
    assert.equal(question.timestamp, new Date(epoch).toISOString());
    const exchange = parsed.turns.slice(1, 3);
    assert.deepEqual(turnTimeBounds(exchange), { startMs: epoch, endMs: epoch + example.completion });
    const combined = { ...question, activities: exchange.flatMap((turn) => turn.activities) };
    assert.equal(turnDurationMs(combined), example.completion);
    const spans = question.debugInfo.stepExecutions.map((exec) => ({
      startMs: Date.parse(exec.triggeredAt), endMs: Date.parse(exec.finishedAt),
    }));
    const gaps = unattributedIntervals(spans, epoch, epoch + example.completion);
    assert.deepEqual(gaps.map(([start, end]) => [start - epoch, end - epoch]), [
      [0, example.searchStart], [example.searchEnd, example.ticketStart], [example.ticketEnd, example.completion],
    ]);
  });
}

test('clips and unions overlapping spans without double-counting nested or parallel work', () => {
  assert.deepEqual(unattributedIntervals([
    { startMs: -500, endMs: 200 }, { startMs: 100, endMs: 400 },
    { startMs: 500, endMs: 2000 }, { startMs: 450, endMs: 450 },
  ], 0, 1000), [[400, 500]]);
});

test('preserves generative completion tails at EOF and before the next user message', () => {
  const activities = [
    activity(0, 'message', { id: 'question', text: 'Question', from: { role: 1 } }),
    event(200, 'ToolCallTrace:Started', { toolCallId: 'tool', toolName: 'TestTool', toolKind: 'connector' }),
    event(700, 'ToolCallTrace:Completed', { toolCallId: 'tool', toolName: 'TestTool', durationMs: 500 }),
    activity(1000, 'message', { id: 'answer', text: 'Answer' }),
    event(1065, 'turn.complete'),
  ];
  for (const withFollowup of [false, true]) {
    const parsed = parseTranscript({ activities: withFollowup ? [
      ...activities,
      activity(5000, 'message', { id: 'followup', text: 'Follow up', from: { role: 1 } }),
      activity(6000, 'message', { id: 'reply', text: 'Reply' }),
      event(6040, 'turn.complete', {}, 'followup'),
    ] : activities });
    const exchange = parsed.turns.slice(0, 2);
    assert.deepEqual(turnTimeBounds(exchange), { startMs: epoch, endMs: epoch + 1065 });
    assert.equal(exchange.flatMap((turn) => turn.activities).filter((a) => a.name === 'turn.complete').length, 1);
    assert.equal(buildWorkflowModel(parsed.turns).turns[0].durationMs, 1065);
    if (withFollowup) {
      assert.equal(parsed.turns[2].activities.some((a) => a.timestampMs === epoch + 1065), false);
      assert.equal(buildWorkflowModel(parsed.turns).turns[1].durationMs, 1040);
    }
  }
});

test('times streamed reasoning from its first to last delta, excluding the closing snapshot', () => {
  const think = (offset, text) => event(offset, 'ThinkingTrace', { thinkingText: text });
  const parsed = parseTranscript({ activities: [
    activity(0, 'message', { id: 'question', text: 'Question', from: { role: 1 } }),
    think(6800, 'Search'), think(7000, ' docs.'), think(9000, 'Search docs.'),
    event(9100, 'ToolCallTrace:Started', { toolCallId: 'tool', toolName: 'search', toolKind: 'search' }),
    event(11100, 'ToolCallTrace:Completed', { toolCallId: 'tool', toolName: 'search', durationMs: 2000 }),
    think(17400, 'Write'), think(18200, ' answer.'), think(37700, 'Write answer.'),
    activity(37750, 'message', { id: 'answer', text: 'Answer' }),
    event(37770, 'turn.complete'),
  ] });
  const reasoning = parsed.turns.flatMap((t) => t.debugInfo?.stepExecutions ?? []).filter((e) => e.taskDialogId === 'GEN:ThinkingTrace');
  assert.deepEqual(reasoning.map((e) => Date.parse(e.finishedAt) - Date.parse(e.triggeredAt)), [200, 800]);
  assert.ok(reasoning.every((e) => hasStepTiming(e)));
});

test('includes connected-agent replies that share numeric role 1 with the user', () => {
  const activities = [
    activity(0, 'message', { id: 'question', text: 'Question', from: { role: 1, aadObjectId: 'synthetic-user' } }),
    event(1000, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Tool', stepId: 'tool' }),
    event(2000, 'DynamicPlanStepFinished', { taskDialogId: 'test.action.Tool', stepId: 'tool', executionTime: '00:00:01' }),
    activity(7290, 'message', { id: 'answer', text: 'Answer', from: { role: 1 } }),
  ];
  const parsed = parseTranscript({ activities });
  assert.deepEqual(parsed.turns.map((turn) => turn.role), ['user', 'assistant']);
  assert.deepEqual(turnTimeBounds(parsed.turns), { startMs: epoch, endMs: epoch + 7290 });
  assert.equal(buildWorkflowModel(parsed.turns).turns[0].durationMs, 7290);
  const combined = { ...parsed.turns[0], activities: parsed.turns.flatMap((turn) => turn.activities) };
  assert.equal(turnDurationMs(combined), 7290);
  const range = activitiesForUserTurn([
    ...activities,
    activity(15000, 'message', { id: 'followup', text: 'Follow up', from: { role: 1, aadObjectId: 'synthetic-user' } }),
  ], 0);
  assert.deepEqual(range, activities);
  assert.equal(isUserMessageActivity(activities[0], false), true);
  assert.equal(isUserMessageActivity(activities.at(-1), false), false);
  assert.equal(buildWorkflowModel([{ ...parsed.turns[0], activities: range }]).turns[0].durationMs, 7290);
});

test('does not treat numeric role 1 as a bot when standard bot messages are present', () => {
  const turn = {
    id: 'question', role: 'user', timestamp: new Date(epoch).toISOString(),
    activities: [
      activity(0, 'message', { id: 'question', from: { role: 1 } }),
      activity(1000, 'message', { id: 'answer', text: 'Answer' }),
      activity(5000, 'message', { id: 'auth', from: { role: 1 }, value: { action: 'submit' } }),
    ],
  };
  assert.deepEqual(turnTimeBounds([turn]), { startMs: epoch, endMs: epoch + 1000 });
});

test('excludes a later bot-only session from the preceding exchange in both orchestration formats', () => {
  const later = 20 * 24 * 60 * 60 * 1000;
  const sessionInfo = (start, end) => activity(end, 'trace', { valueType: 'SessionInfo', value: {
    startTimeUtc: new Date(epoch + start).toISOString(),
    endTimeUtc: new Date(epoch + end).toISOString(),
  } });
  for (const generative of [false, true]) {
    const parsed = parseTranscript({ activities: [
      activity(0, 'message', { id: 'question', text: 'Question', from: { role: 1 } }),
      ...(generative ? [
        event(500, 'ToolCallTrace:Started', { toolCallId: 'tool', toolName: 'TestTool' }),
        event(1500, 'ToolCallTrace:Completed', { toolCallId: 'tool', durationMs: 1000 }),
      ] : [
        event(500, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Tool', stepId: 'tool' }),
        event(1500, 'DynamicPlanStepFinished', { taskDialogId: 'test.action.Tool', stepId: 'tool', executionTime: '00:00:01' }),
      ]),
      activity(2000, 'message', { id: 'answer', text: 'Answer' }),
      sessionInfo(0, 2000),
      activity(later, 'trace', { valueType: 'ConversationInfo' }),
      activity(later, 'message', { id: 'later-error', text: 'Synthetic error' }),
      sessionInfo(later, later),
    ] });
    assert.deepEqual(turnTimeBounds(parsed.turns), { startMs: epoch, endMs: epoch + 2000 });
    assert.equal(buildWorkflowModel(parsed.turns).turns[0].durationMs, 2000);
    const combined = { ...parsed.turns[0], activities: parsed.turns.flatMap((turn) => turn.activities) };
    assert.equal(turnDurationMs(combined), 2000);
  }
});

test('honors merged session keys when the next session has no SessionInfo', () => {
  const parsed = parseTranscript({ activities: [
    activity(0, 'message', { id: 'question', from: { role: 1 }, text: 'Question', mergedSessionKey: 'first' }),
    activity(1000, 'message', { id: 'answer', text: 'Answer', mergedSessionKey: 'first' }),
    activity(50000, 'message', { id: 'later-error', text: 'Synthetic error', mergedSessionKey: 'second' }),
  ] });
  assert.deepEqual(turnTimeBounds(parsed.turns), { startMs: epoch, endMs: epoch + 1000 });
  assert.equal(buildWorkflowModel(parsed.turns).turns[0].durationMs, 1000);
});

test('does not truncate sub-second completion tails to rounded SessionInfo end times', () => {
  const later = 50000;
  const turn = { id: 'question', role: 'user', activities: [
    activity(0, 'message', { id: 'question', from: { role: 1 } }),
    activity(2050, 'message', { id: 'answer', text: 'Answer' }),
    event(2065, 'DynamicPlanFinished'),
    activity(2100, 'trace', { valueType: 'SessionInfo', value: {
      startTimeUtc: new Date(epoch).toISOString(), endTimeUtc: new Date(epoch + 2000).toISOString(),
    } }),
    activity(later, 'message', { id: 'later-error', text: 'Synthetic error' }),
    activity(later, 'trace', { valueType: 'SessionInfo', value: {
      startTimeUtc: new Date(epoch + later).toISOString(), endTimeUtc: new Date(epoch + later).toISOString(),
    } }),
  ] };
  assert.deepEqual(turnTimeBounds([turn]), { startMs: epoch, endMs: epoch + 2065 });
});

test('keeps late startup completion with its greeting, at EOF and before the first question', () => {
  const activities = [
    event(0, 'DynamicPlanStepTriggered', { taskDialogId: 'test.action.Profile', stepId: 'profile' }, 'startup'),
    activity(500, 'message', { id: 'greeting', text: 'Hello' }),
    event(800, 'DynamicPlanStepFinished', {
      taskDialogId: 'test.action.Profile', stepId: 'profile', executionTime: '00:00:00.800',
    }, 'startup'),
    event(900, 'DynamicPlanFinished', {}, 'startup'),
  ];
  for (const withQuestion of [false, true]) {
    const parsed = parseTranscript({ activities: withQuestion ? [
      ...activities,
      activity(5000, 'message', { id: 'question', text: 'Question', from: { role: 1 } }),
    ] : activities });
    const startup = parsed.turns[0];
    assert.equal(startup.activities.filter((a) => a.name === 'DynamicPlanFinished').length, 1);
    assert.equal(hasStepTiming(startup.debugInfo.stepExecutions[0]), true);
    assert.equal(buildWorkflowModel(parsed.turns).turns[0].durationMs, 900);
    if (withQuestion) assert.equal(parsed.turns[1].activities.length, 1);
  }
});

test('distinguishes recorded zero duration from a trigger or bind with no finish', () => {
  assert.equal(hasStepTiming({ triggeredAt: '2026-01-01T00:00:00Z' }), false);
  assert.equal(hasStepTiming({ executionTime: '00:00:00' }), true);
  assert.equal(hasStepTiming({ executionTime: 'invalid' }), false);
  assert.equal(hasStepTiming({ executionTime: '00:00' }), false);
  assert.equal(hasStepTiming({ triggeredAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z' }), true);
});

test('preserves completed-only tools, but excludes reasoning/bookkeeping from the time window', () => {
  const turn = { id: 'bot', role: 'assistant', timestamp: '', activities: [], debugInfo: { stepExecutions: [
    { taskDialogId: 'tool', stepId: 'tool', finishedAt: new Date(epoch + 1000).toISOString(), executionTime: '00:00:00.500' },
    { taskDialogId: 'P:CaptureContextTool', stepId: 'context', triggeredAt: new Date(epoch + 5000).toISOString() },
    { taskDialogId: 'GEN:ThinkingTrace', stepId: 'reason', triggeredAt: new Date(epoch - 5000).toISOString() },
  ] } };
  assert.deepEqual(turnTimeBounds([turn]), { startMs: epoch + 500, endMs: epoch + 1000 });
});

test('MCP initialization overlaps the exchange rather than adding to it, and requires both endpoints', () => {
  const turn = {
    id: 'question', role: 'user', content: 'Question', timestamp: new Date(epoch).toISOString(),
    activities: [
      activity(0, 'message', { id: 'question', from: { role: 1 } }),
      event(100, 'DynamicServerInitialize', { dialogSchemaName: 'test.mcp' }),
      event(1900, 'DynamicServerToolsList', { dialogSchemaName: 'test.mcp' }),
      activity(3000, 'message', { id: 'answer', text: 'Answer' }),
    ],
    debugInfo: {
      mcpServers: [{ name: 'Test server', schemaName: 'test.mcp' }],
      stepExecutions: [{
        taskDialogId: 'test.action.Tool', stepId: 'tool', type: 'Action',
        triggeredAt: new Date(epoch + 500).toISOString(),
        finishedAt: new Date(epoch + 2500).toISOString(), executionTime: '00:00:02',
      }],
    },
  };
  const [workflow] = buildWorkflowModel([turn]).turns;
  assert.equal(workflow.durationMs, 3000);
  assert.equal(workflow.rows[0].node.duration, '1.80 s');
  const incomplete = { ...turn, activities: turn.activities.filter((a) => a.name !== 'DynamicServerToolsList') };
  assert.equal(buildWorkflowModel([incomplete]).turns[0].rows[0].node.duration, 'Unknown');
});
