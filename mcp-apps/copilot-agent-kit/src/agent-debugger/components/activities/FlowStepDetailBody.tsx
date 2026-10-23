import * as React from 'react';
import { Badge, Text, mergeClasses, tokens } from '@fluentui/react-components';
import { ErrorCircle16Regular } from '@fluentui/react-icons';

import type { Activity, MCPTool, ProcessedTurn, StepExecution } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { FlowStep } from '../../contracts/flow-step';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { useDebugStyles } from '../../styles/useDebugStyles';
import { asRecord, getStepDisplayDescription, readString } from '../../utils/build-flow-steps';
import {
  getLatestGPTAnswerTrace,
  getLatestResponseGeneratorSupport,
  getLatestUniversalSearchTrace,
} from '../../utils/activity-trace-selectors';
import { isReasonerTool, parseMcpTaskDialogId } from '../../utils/step-classification';
import { resolveConnectedAgentOutput } from '../../utils/connected-agent-output';
import {
  DetailEmptyText,
  DetailInputsSection,
  DetailOutputField,
  DetailSectionTitle,
  DetailTextSection,
  ErrorDetails,
  GenAiSupportDetails,
  IntentRecognitionDetails,
  ReasoningDetails,
  StepDetails,
  VariableAssignmentDetails,
} from './detail-renderers';

export interface FlowStepDetailBodyProps {
  step: FlowStep;
  turn: ProcessedTurn | null;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgent?: ConnectedAgentInfo;
}

function buildExecutionIndex(turn: ProcessedTurn | null): Map<string, StepExecution> {
  const map = new Map<string, StepExecution>();
  for (const exec of turn?.debugInfo?.stepExecutions ?? []) {
    const task = String(exec.taskDialogId ?? '');
    const stepId = String(exec.stepId ?? '');
    if (stepId) map.set(`${task}:${stepId}`, exec);
    if (!map.has(task)) map.set(task, exec);
  }

  return map;
}

function collectMcpTools(
  turn: ProcessedTurn | null,
  connectedAgent?: ConnectedAgentInfo,
): MCPTool[] {
  const tools: MCPTool[] = [];
  const seen = new Set<string>();
  const turns = [
    ...(turn ? [turn] : []),
    ...(connectedAgent?.childTranscript ?? []),
  ];

  for (const sourceTurn of turns) {
    for (const tool of sourceTurn.debugInfo?.mcpTools ?? []) {
      const key = `${tool.schemaName ?? ''}:${tool.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tools.push(tool);
    }
  }
  return tools;
}

/**
 * Renders the type-specific detail body for a single {@link FlowStep}.
 *
 * The branch structure and every extraction expression below are lifted from
 * `DebugPanel`'s detail panel so the new-UI pane shows exactly the same data.
 * Only the surrounding chrome (header, close button, panel frame) comes from
 * the new design; the body reuses the original renderers unchanged.
 */
export function FlowStepDetailBody({
  step,
  turn,
  componentNameBySchemaName,
  connectedAgent,
}: FlowStepDetailBodyProps): React.ReactElement {
  const styles = useDebugStyles();
  const stepExecutionByKey = React.useMemo(() => buildExecutionIndex(turn), [turn]);
  const availableMcpTools = React.useMemo(
    () => collectMcpTools(turn, connectedAgent),
    [turn, connectedAgent],
  );

  if (step.kind === 'thinking' || isReasonerTool(step.taskDialogId ?? '')) {
    return <ReasoningDetails turn={turn} step={step} />;
  }

  if (step.kind === 'intent') {
    return <IntentRecognitionDetails turn={turn} activityIndex={step.activityIndex} />;
  }

  if (step.kind === 'vars') {
    return <VariableAssignmentDetails turn={turn} activityIndex={step.activityIndex} />;
  }

  if (step.kind === 'error') {
    return (
      <ErrorDetails
        turn={turn}
        activityIndex={step.activityIndex}
        fallbackStep={step}
        componentNameBySchemaName={componentNameBySchemaName}
      />
    );
  }

  if (step.kind === 'trace') {
    const traceActivities = step.traceActivities ?? [];

    return (
      <div className={mergeClasses(styles.spaceY4, "w-dsec")}>
        <DetailTextSection title="Topic" content={step.title} />
        <DetailOutputField
          label="Activity nodes"
          value={JSON.stringify(traceActivities, null, 2)}
          displayMode="json-code"
          maxHeight="520px"
        />
      </div>
    );
  }

  if (step.kind === 'mcp') {
    const description =
      step.modelDescription ||
      (() => {
        const mcpSchemaName = step.mcpServerSchemaName || turn?.debugInfo?.mcpServerInfo?.schemaName;
        const componentInfo = mcpSchemaName ? componentNameBySchemaName?.[mcpSchemaName] : undefined;
        return componentInfo?.modelDescription || componentInfo?.description;
      })();
    const allTools = availableMcpTools;
    const filteredTools = step.mcpServerSchemaName
      ? allTools.filter((t) => t.schemaName === step.mcpServerSchemaName)
      : allTools;

    return (
      <div className={mergeClasses(styles.spaceY4, "w-dsec")}>
        <DetailTextSection title="Description" content={description || ''} />
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Tools</DetailSectionTitle>
          {filteredTools.length ? (
            <div style={{ marginTop: tokens.spacingVerticalS }}>
              <div className={styles.toolsTableHeader}>
                <Text className={styles.toolsTableHeaderCell} style={{ width: '140px', flexShrink: 0 }}>
                  Tool name
                </Text>
                <Text className={styles.toolsTableHeaderCell} style={{ flex: 1 }}>
                  Description
                </Text>
              </div>
              <div className={styles.mcpToolsList}>
                {filteredTools.map((tool) => (
                  <div key={tool.identifier} className={styles.toolsTableRow}>
                    <div className={mergeClasses(styles.toolsTableCell, styles.toolsTableCellName)}>
                      {tool.displayName || tool.identifier}
                    </div>
                    <div className={mergeClasses(styles.toolsTableCell, styles.toolsTableCellDesc)}>
                      {tool.description || '\u2014'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DetailEmptyText>No MCP tools captured for this turn.</DetailEmptyText>
          )}
        </div>
      </div>
    );
  }

  if (step.kind === 'genai') {
    if (step.key === 'meta:GPTAnswer') {
      const gptAnswerTrace = getLatestGPTAnswerTrace(Array.isArray(turn?.activities) ? turn.activities : []);
      const messageText = gptAnswerTrace?.text ?? '';
      const promptTokens = gptAnswerTrace?.promptTokens ?? 0;
      const completionTokens = gptAnswerTrace?.completionTokens ?? 0;
      const totalTokens = promptTokens + completionTokens;

      return (
        <div className={mergeClasses(styles.spaceY4, "w-dsec")}>
          <div>
            <Text className={mergeClasses(styles.sectionTitle, "w-dsec-title")}>GPT Answer</Text>
            {gptAnswerTrace?.gptAnswerState && (
              <Text
                style={{
                  fontSize: tokens.fontSizeBase200,
                  color: tokens.colorNeutralForeground3,
                  marginTop: tokens.spacingVerticalXXS,
                  display: 'block',
                }}
              >
                State: {gptAnswerTrace.gptAnswerState}
              </Text>
            )}
          </div>
          {messageText && (
            <div>
              <Text className={mergeClasses(styles.sectionTitle, "w-dsec-title")}>Response</Text>
              <div className={mergeClasses(styles.dataBox, "w-dsec-box")} style={{ maxHeight: '256px', overflowY: 'auto' }}>
                {messageText}
              </div>
            </div>
          )}
          {totalTokens > 0 && (
            <div>
              <Text className={mergeClasses(styles.sectionTitle, "w-dsec-title")}>Token Usage</Text>
              <div className={styles.tokenGrid}>
                <div className={styles.tokenBox}>
                  <Text className={mergeClasses(styles.tokenLabel, "w-dsec-label")}>Prompt Tokens</Text>
                  <Text className={mergeClasses(styles.tokenValue, styles.tokenBlue)}>{promptTokens}</Text>
                </div>
                <div className={styles.tokenBox}>
                  <Text className={mergeClasses(styles.tokenLabel, "w-dsec-label")}>Completion Tokens</Text>
                  <Text className={mergeClasses(styles.tokenValue, styles.tokenIndigo)}>{completionTokens}</Text>
                </div>
                <div className={styles.tokenBox}>
                  <Text className={mergeClasses(styles.tokenLabel, "w-dsec-label")}>Total Tokens</Text>
                  <Text className={mergeClasses(styles.tokenValue, styles.tokenPurple)}>{totalTokens}</Text>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return <GenAiSupportDetails debugInfo={turn?.debugInfo} />;
  }

  if (step.kind === 'code') {
    return (
      <div className={mergeClasses(styles.spaceY4, "w-dsec")}>
        {step.thought && <DetailTextSection title="Thought" content={step.thought} />}
        {step.codeInputs && Object.keys(step.codeInputs).length > 0 && (
          <DetailInputsSection inputs={Object.entries(step.codeInputs)} />
        )}
        {(step.codeResponse || step.codePreview) && (
          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Outputs</DetailSectionTitle>
            {step.codeResponse && (
              <div style={{ marginTop: tokens.spacingVerticalS }}>
                <DetailOutputField label="Result" value={step.codeResponse} maxHeight="520px" />
              </div>
            )}
            {step.codePreview && (
              <div style={{ marginTop: tokens.spacingVerticalS }}>
                <DetailOutputField label="Python" value={step.codePreview} maxHeight="520px" displayMode="code" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Generic step branch — mirrors the `StepDetails` fallback in DebugPanel.
  const task = step.taskDialogId ? String(step.taskDialogId) : '';
  const stepId = step.stepId ? String(step.stepId) : '';
  const execKey = stepId ? `${task}:${stepId}` : task;
  const exec = execKey ? stepExecutionByKey.get(execKey) ?? stepExecutionByKey.get(task) : undefined;
  const args = exec?.arguments ?? step.codeInputs;
  const argEntries = args && typeof args === 'object' ? Object.entries(args as Record<string, unknown>) : [];
  const activities: Activity[] = Array.isArray(turn?.activities) ? turn.activities : [];

  const activityObs = (() => {
    for (let i = activities.length - 1; i >= 0; i -= 1) {
      const a = activities[i];
      if (a?.name !== 'DynamicPlanStepFinished' && a?.valueType !== 'DynamicPlanStepFinished') continue;
      const v = asRecord(a.value);
      const activityTask = readString(v, 'taskDialogId') ?? '';
      const activityStepId = readString(v, 'stepId') ?? '';
      if (activityTask !== task) continue;
      if (stepId && activityStepId && activityStepId !== stepId) continue;
      return v?.observation;
    }
    return undefined;
  })();

  const rawObservation = exec?.observation ?? activityObs;
  const isAgentStep = step.subtitle === 'Connected agent' || step.subtitle === 'Child agent';
  const obs = isAgentStep && exec && turn
    ? resolveConnectedAgentOutput(turn, exec, connectedAgent)
    : rawObservation;
  const responseSupport = getLatestResponseGeneratorSupport(activities);
  const universalSearchTrace = getLatestUniversalSearchTrace(activities);
  const isUniversalSearch = task === 'P:UniversalSearchTool';
  const isKnowledgeStep = step.subtitle === 'Knowledge';
  const showSearchSources = isUniversalSearch || isKnowledgeStep;
  const isGenerativeKnowledge = isKnowledgeStep && exec?.toolKind === 'search';
  const generativeKnowledge = isGenerativeKnowledge
    ? { sources: exec?.knowledgeSources?.searched ?? [] }
    : undefined;
  const mcpParsed = parseMcpTaskDialogId(task);
  const mcpToolDef = (() => {
    const identifier = mcpParsed?.toolIdentifier;
    if (!identifier) return undefined;
    return availableMcpTools.find((t) => String(t?.identifier ?? '') === identifier);
  })();

  return (
    <>
      {step.blockedError && (
        <div className={styles.spaceY4} style={{ marginBottom: tokens.spacingVerticalM }}>
          <DetailTextSection
            title="Block Reason"
            content={step.blockedError.message || 'Content was blocked by Responsible AI restrictions.'}
          />
          <DetailOutputField
            label="Details"
            value={JSON.stringify(
              Object.fromEntries(
                (
                  [
                    ['code', step.blockedError.code],
                    step.blockedError.reasonCode ? ['reasonCode', step.blockedError.reasonCode] : null,
                  ] as Array<[string, string] | null>
                ).filter((e): e is [string, string] => e !== null),
              ),
              null,
              2,
            )}
            displayMode="json-code"
          />
        </div>
      )}
      <StepDetails
        argsEntries={argEntries}
        observation={obs}
        showSearchSources={showSearchSources}
        generativeKnowledge={generativeKnowledge}
        responseSupport={responseSupport}
        universalSearchTrace={universalSearchTrace}
        citedKnowledgeSources={turn?.debugInfo?.knowledgeSources?.cited}
        componentNameBySchemaName={componentNameBySchemaName}
        mcpTool={mcpToolDef}
        mcpToolIdentifier={mcpParsed?.toolIdentifier}
        thought={step.thought}
        description={getStepDisplayDescription(step)}
        triggerQueries={step.subtitle === 'Topic' ? step.triggerQueries : undefined}
      />
      {step.genAiSupportData && (
        <GenAiSupportDetails
          debugInfo={
            { genAiSupportData: step.genAiSupportData, tokenInfo: step.tokenInfo } as ProcessedTurn['debugInfo']
          }
          hideQuery={isKnowledgeStep}
          hideSources={isKnowledgeStep}
        />
      )}
    </>
  );
}

/** Status badges shown next to the detail title, mirroring DebugPanel's header. */
export function FlowStepStatusBadges({ step }: { step: FlowStep }): React.ReactElement | null {
  const styles = useDebugStyles();
  if (!step.statusText && !step.finishedState) return null;
  return (
    <>
      {step.statusText && step.kind !== 'error' && step.kind !== 'vars' && (
        <span className={styles.mcpStatusBadge}>{step.statusText}</span>
      )}
      {step.finishedState === 'failed' && (
        <span className="w-failed-status">
          <ErrorCircle16Regular aria-hidden="true" />
          Failed
        </span>
      )}
      {step.finishedState === 'blocked' && (
        <Badge appearance="tint" color="warning" shape="rounded">
          Blocked
        </Badge>
      )}
    </>
  );
}
