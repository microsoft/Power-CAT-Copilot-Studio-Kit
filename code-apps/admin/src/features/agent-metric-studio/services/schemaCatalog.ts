// Static catalog of source tables + their aggregatable fields. Used by the
// Metric Registry to populate friendly dropdowns instead of free-text inputs,
// and to translate raw logical names to human labels in tables & tooltips.
//
// Only tables/fields that users would realistically aggregate are listed.
// "kind" is a hint for future filtering (numeric vs categorical).

export type FieldKind = 'numeric' | 'categorical' | 'text' | 'boolean' | 'date' | 'id';

export interface SchemaField {
  logical: string;
  label: string;
  kind: FieldKind;
}

export type TableCategory = 'Conversations' | 'Performance' | 'Agents' | 'Quality' | 'Testing';

export interface SchemaTable {
  logical: string;        // e.g. "cat_copilotkpi"
  label: string;          // e.g. "Copilot KPIs"
  description?: string;
  category: TableCategory;
  fields: SchemaField[];
}

/** Groups for rendering the Source Table dropdown with OptionGroup */
export const TABLE_CATEGORIES: { label: string; value: TableCategory }[] = [
  { label: 'Conversations & Outcomes', value: 'Conversations' },
  { label: 'Performance & Latency', value: 'Performance' },
  { label: 'Agent Inventory & Usage', value: 'Agents' },
  { label: 'Quality & Compliance', value: 'Quality' },
  { label: 'Agent Testing', value: 'Testing' },
];

export const schemaCatalog: SchemaTable[] = [
  {
    logical: 'cat_copilotkpi',
    label: 'Copilot KPIs',
    description: 'Session-level conversation metrics (turns, CSAT, outcomes).',
    category: 'Conversations',
    fields: [
      { logical: 'cat_sessions',              label: 'Sessions',               kind: 'numeric' },
      { logical: 'cat_turns',                 label: 'Turns',                  kind: 'numeric' },
      { logical: 'cat_conversationduration',  label: 'Conversation duration',  kind: 'numeric' },
      { logical: 'cat_csat',                  label: 'CSAT score',             kind: 'numeric' },
      { logical: 'cat_globaloutcomecode',     label: 'Outcome',                kind: 'categorical' },
      { logical: 'cat_copilotkpiid',          label: 'Record id (count)',      kind: 'id' },
    ],
  },
  {
    logical: 'cat_agentdetails',
    label: 'Agent details',
    description: 'Agent inventory metadata (published, autonomous, uses GenAI).',
    category: 'Agents',
    fields: [
      { logical: 'cat_agentid',                    label: 'Agent id',               kind: 'id' },
      { logical: 'cat_usesgenaicode',              label: 'Uses GenAI',             kind: 'boolean' },
      { logical: 'cat_autonomousagentcode',        label: 'Autonomous agent',       kind: 'boolean' },
      { logical: 'cat_usesknowledgesourcescode',   label: 'Uses knowledge sources', kind: 'boolean' },
      { logical: 'cat_usestoolscode',              label: 'Uses tools',             kind: 'boolean' },
      { logical: 'cat_usesmcpcode',                label: 'Uses MCP',               kind: 'boolean' },
      { logical: 'cat_usespromptscode',            label: 'Uses prompts',           kind: 'boolean' },
      { logical: 'cat_usesdeepreasoningmodelscode', label: 'Uses deep reasoning',  kind: 'boolean' },
      { logical: 'cat_usesskillscode',             label: 'Uses skills',            kind: 'boolean' },
      { logical: 'cat_websearchenabledcode',       label: 'Web search enabled',     kind: 'boolean' },
      { logical: 'cat_publishedcode',              label: 'Published',              kind: 'boolean' },
      { logical: 'cat_name',                       label: 'Agent name',             kind: 'text' },
      { logical: 'cat_type',                       label: 'Agent type',             kind: 'categorical' },
      { logical: 'cat_orchestrationtype',          label: 'Orchestration type',     kind: 'categorical' },
      { logical: 'cat_model',                      label: 'Model',                  kind: 'categorical' },
      { logical: 'cat_environmentname',            label: 'Environment name',       kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_agentusagehistory',
    label: 'Agent usage history',
    description: 'Daily Copilot credit consumption per agent.',
    category: 'Agents',
    fields: [
      { logical: 'cat_billedcopilotcredits',     label: 'Billed credits',      kind: 'numeric' },
      { logical: 'cat_nonbilledcopilotcredits',  label: 'Non-billed credits',  kind: 'numeric' },
      { logical: 'cat_users',                    label: 'Users',               kind: 'numeric' },
      { logical: 'cat_featurename',              label: 'Feature name',        kind: 'categorical' },
      { logical: 'cat_llmmodel',                 label: 'LLM model',           kind: 'categorical' },
      { logical: 'cat_agentusagehistoryid',      label: 'Record id (count)',   kind: 'id' },
    ],
  },
  {
    logical: 'cat_agentvalue',
    label: 'Agent value',
    description: 'Value / benefit classifications assigned to agents.',
    category: 'Agents',
    fields: [
      { logical: 'cat_agentvalueid',          label: 'Record id (count)',      kind: 'id' },
      { logical: 'cat_agentvaluebenefit',     label: 'Value benefit',          kind: 'categorical' },
      { logical: 'cat_agentbehaviors',        label: 'Agent behaviors',        kind: 'categorical' },
      { logical: 'cat_agenttypes',            label: 'Agent types',            kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_conversationanalyzer',
    label: 'Conversation analyzer',
    description: 'Analyzer run results — messages, duration, prompts.',
    category: 'Conversations',
    fields: [
      { logical: 'cat_conversationanalyzerid',       label: 'Record id (count)',   kind: 'id' },
      { logical: 'cat_messages',                     label: 'Messages',             kind: 'numeric' },
      { logical: 'cat_conversationdurationseconds',  label: 'Conversation seconds', kind: 'numeric' },
    ],
  },
  {
    logical: 'cat_dailymetrics',
    label: 'Daily metrics',
    description: 'Pre-aggregated daily conversation, response, and latency metrics.',
    category: 'Performance',
    fields: [
      { logical: 'cat_dailyconversationcount',   label: 'Daily conversation count', kind: 'numeric' },
      { logical: 'cat_dailyuniqueusers',         label: 'Daily unique users',       kind: 'numeric' },
      { logical: 'cat_dailyuniquetopics',        label: 'Daily unique topics',      kind: 'numeric' },
      { logical: 'cat_dailyuniquetools',         label: 'Daily unique tools',       kind: 'numeric' },
      { logical: 'cat_multiturnconversations',   label: 'Multi-turn conversations', kind: 'numeric' },
      { logical: 'cat_singleturnconversations',  label: 'Single-turn conversations', kind: 'numeric' },
      { logical: 'cat_longconversations',        label: 'Long conversations',       kind: 'numeric' },
      { logical: 'cat_mediumconversations',      label: 'Medium conversations',     kind: 'numeric' },
      { logical: 'cat_shortconversations',       label: 'Short conversations',      kind: 'numeric' },
      { logical: 'cat_totalusermessages',        label: 'Total user messages',      kind: 'numeric' },
      { logical: 'cat_totalresponses',           label: 'Total responses',          kind: 'numeric' },
      { logical: 'cat_errorcount',               label: 'Error count',              kind: 'numeric' },
      { logical: 'cat_slowresponses16s',         label: 'Slow responses (>16s)',    kind: 'numeric' },
      { logical: 'cat_mediandurationms',         label: 'Median duration (ms)',     kind: 'numeric' },
      { logical: 'cat_p95durationms',            label: 'P95 duration (ms)',        kind: 'numeric' },
      { logical: 'cat_totaldurationms',          label: 'Total duration (ms)',      kind: 'numeric' },
      { logical: 'cat_p50responsetimems',        label: 'P50 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p90responsetimems',        label: 'P90 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p95responsetimems',        label: 'P95 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p99responsetimems',        label: 'P99 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_maxresponsetimems',        label: 'Max response time (ms)',   kind: 'numeric' },
      { logical: 'cat_minresponsetimems',        label: 'Min response time (ms)',   kind: 'numeric' },
      { logical: 'cat_stddevresponsetimems',     label: 'Std dev response time (ms)', kind: 'numeric' },
      { logical: 'cat_totalresponsetimems',      label: 'Total response time (ms)', kind: 'numeric' },
      { logical: 'cat_toolcallcount',            label: 'Tool call count',          kind: 'numeric' },
      { logical: 'cat_toolfailurecount',         label: 'Tool failure count',       kind: 'numeric' },
      { logical: 'cat_toolsuccesscount',         label: 'Tool success count',       kind: 'numeric' },
      { logical: 'cat_p50toolresponsetimems',    label: 'P50 tool response time (ms)', kind: 'numeric' },
      { logical: 'cat_p95toolresponsetimems',    label: 'P95 tool response time (ms)', kind: 'numeric' },
      { logical: 'cat_maxtoolresponsetimems',    label: 'Max tool response time (ms)', kind: 'numeric' },
      { logical: 'cat_totaltoolresponsetimems',  label: 'Total tool response time (ms)', kind: 'numeric' },
      { logical: 'cat_conversationcountforduration', label: 'Conversations (for duration)', kind: 'numeric' },
    ],
  },
  {
    logical: 'cat_toolmetrics',
    label: 'Tool metrics',
    description: 'Per-tool call counts, success/failure rates, and latency.',
    category: 'Performance',
    fields: [
      { logical: 'cat_callcount',            label: 'Call count',               kind: 'numeric' },
      { logical: 'cat_successcount',         label: 'Success count',            kind: 'numeric' },
      { logical: 'cat_failurecount',         label: 'Failure count',            kind: 'numeric' },
      { logical: 'cat_successrate',          label: 'Success rate',             kind: 'numeric' },
      { logical: 'cat_failurerate',          label: 'Failure rate',             kind: 'numeric' },
      { logical: 'cat_avgresponsetimems',    label: 'Avg response time (ms)',   kind: 'numeric' },
      { logical: 'cat_medianresponsetimems', label: 'Median response time (ms)', kind: 'numeric' },
      { logical: 'cat_maxresponsetimems',    label: 'Max response time (ms)',   kind: 'numeric' },
      { logical: 'cat_minresponsetimems',    label: 'Min response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p90responsetimems',    label: 'P90 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p95responsetimems',    label: 'P95 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_p99responsetimems',    label: 'P99 response time (ms)',   kind: 'numeric' },
      { logical: 'cat_stddevresponsetimems', label: 'Std dev response time (ms)', kind: 'numeric' },
      { logical: 'cat_uniqueconversations',  label: 'Unique conversations',    kind: 'numeric' },
      { logical: 'cat_toolname',             label: 'Tool name',               kind: 'categorical' },
      { logical: 'cat_tooltype',             label: 'Tool type',               kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_topicmetrics',
    label: 'Topic metrics',
    description: 'Per-topic trigger counts, completion/abandonment rates, and durations.',
    category: 'Conversations',
    fields: [
      { logical: 'cat_triggercount',             label: 'Trigger count',            kind: 'numeric' },
      { logical: 'cat_completioncount',          label: 'Completion count',         kind: 'numeric' },
      { logical: 'cat_completionrate',           label: 'Completion rate',          kind: 'numeric' },
      { logical: 'cat_abandonmentcount',         label: 'Abandonment count',        kind: 'numeric' },
      { logical: 'cat_abandonmentrate',          label: 'Abandonment rate',         kind: 'numeric' },
      { logical: 'cat_errorcount',               label: 'Error count',              kind: 'numeric' },
      { logical: 'cat_errorrate',                label: 'Error rate',               kind: 'numeric' },
      { logical: 'cat_dailyuniqueconversations', label: 'Daily unique conversations', kind: 'numeric' },
      { logical: 'cat_dailyuniqueusers',         label: 'Daily unique users',       kind: 'numeric' },
      { logical: 'cat_messagecount',             label: 'Message count',            kind: 'numeric' },
      { logical: 'cat_messagesin',               label: 'Messages in',              kind: 'numeric' },
      { logical: 'cat_messagesout',              label: 'Messages out',             kind: 'numeric' },
      { logical: 'cat_actioncount',              label: 'Action count',             kind: 'numeric' },
      { logical: 'cat_redirectcount',            label: 'Redirect count',           kind: 'numeric' },
      { logical: 'cat_durationcount',            label: 'Duration count',           kind: 'numeric' },
      { logical: 'cat_mediandurationms',         label: 'Median duration (ms)',     kind: 'numeric' },
      { logical: 'cat_maxdurationms',            label: 'Max duration (ms)',        kind: 'numeric' },
      { logical: 'cat_mindurationms',            label: 'Min duration (ms)',        kind: 'numeric' },
      { logical: 'cat_p95durationms',            label: 'P95 duration (ms)',        kind: 'numeric' },
      { logical: 'cat_totaldurationms',          label: 'Total duration (ms)',      kind: 'numeric' },
      { logical: 'cat_maxactionelapsedms',       label: 'Max action elapsed (ms)', kind: 'numeric' },
      { logical: 'cat_p90actionelapsedms',       label: 'P90 action elapsed (ms)', kind: 'numeric' },
      { logical: 'cat_totalactionelapsedms',     label: 'Total action elapsed (ms)', kind: 'numeric' },
      { logical: 'cat_topicname',                label: 'Topic name',              kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_transcriptmetrics',
    label: 'Transcript metrics',
    description: 'Aggregated conversation outcomes, CSAT, and feedback counts.',
    category: 'Conversations',
    fields: [
      { logical: 'cat_totalconversations',    label: 'Total conversations',    kind: 'numeric' },
      { logical: 'cat_sessioncount',          label: 'Session count',          kind: 'numeric' },
      { logical: 'cat_totalturns',            label: 'Total turns',            kind: 'numeric' },
      { logical: 'cat_resolvedcount',         label: 'Resolved count',         kind: 'numeric' },
      { logical: 'cat_escalatedcount',        label: 'Escalated count',        kind: 'numeric' },
      { logical: 'cat_abandonedcount',        label: 'Abandoned count',        kind: 'numeric' },
      { logical: 'cat_unengagedcount',        label: 'Unengaged count',        kind: 'numeric' },
      { logical: 'cat_engagedcount',          label: 'Engaged count',          kind: 'numeric' },
      { logical: 'cat_csatcount',             label: 'CSAT count',             kind: 'numeric' },
      { logical: 'cat_csatscore',             label: 'CSAT score',             kind: 'numeric' },
      { logical: 'cat_feedbacklikecount',     label: 'Feedback like count',    kind: 'numeric' },
      { logical: 'cat_feedbackdislikecount',  label: 'Feedback dislike count', kind: 'numeric' },
    ],
  },
  {
    logical: 'cat_actionmetrics',
    label: 'Action metrics',
    description: 'Action node execution counts and latency percentiles.',
    category: 'Performance',
    fields: [
      { logical: 'cat_executioncount',         label: 'Execution count',        kind: 'numeric' },
      { logical: 'cat_dailyconversationcount', label: 'Daily conversation count', kind: 'numeric' },
      { logical: 'cat_avgelapsedms',           label: 'Avg elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_p10elapsedms',           label: 'P10 elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_p50elapsedms',           label: 'P50 elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_p90elapsedms',           label: 'P90 elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_p95elapsedms',           label: 'P95 elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_p99elapsedms',           label: 'P99 elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_maxelapsedms',           label: 'Max elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_minelapsedms',           label: 'Min elapsed (ms)',       kind: 'numeric' },
      { logical: 'cat_stddevelapsedms',        label: 'Std dev elapsed (ms)',   kind: 'numeric' },
      { logical: 'cat_totalelapsedms',         label: 'Total elapsed (ms)',     kind: 'numeric' },
      { logical: 'cat_nodekind',               label: 'Node kind',              kind: 'categorical' },
      { logical: 'cat_agentname',              label: 'Agent name',             kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_agentcompliance',
    label: 'Agent compliance',
    description: 'PII violations, sentiment analysis, and compliance status.',
    category: 'Quality',
    fields: [
      { logical: 'cat_perctranscriptsinpiiviolation',   label: 'PII violation %',          kind: 'numeric' },
      { logical: 'cat_perctranscriptswithlowsentiment', label: 'Low sentiment %',          kind: 'numeric' },
      { logical: 'cat_sentimentscoremonthlyaverage',    label: 'Sentiment score (monthly)', kind: 'numeric' },
      { logical: 'cat_transcriptspiivioloations',       label: 'PII violation count',      kind: 'numeric' },
      { logical: 'cat_transcriptswithlowsentiment',     label: 'Low sentiment count',      kind: 'numeric' },
      { logical: 'cat_sentimenttotaltranscripts',       label: 'Sentiment total transcripts', kind: 'numeric' },
      { logical: 'cat_totaltranscripts',                label: 'PII total transcripts',    kind: 'numeric' },
      { logical: 'cat_piicompliancestatus',             label: 'PII compliance status',    kind: 'categorical' },
      { logical: 'cat_sentimentanalysisstatus',         label: 'Sentiment analysis status', kind: 'categorical' },
      { logical: 'cat_piiseverity',                     label: 'PII severity',             kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_agentreviews',
    label: 'Agent reviews',
    description: 'Agent quality review scores, patterns, and issue counts.',
    category: 'Quality',
    fields: [
      { logical: 'cat_overallscore',        label: 'Overall score',        kind: 'numeric' },
      { logical: 'cat_patternscore',        label: 'Pattern score',        kind: 'numeric' },
      { logical: 'cat_instructionscore',    label: 'Instruction score',    kind: 'numeric' },
      { logical: 'cat_totalissues',         label: 'Total issues',         kind: 'numeric' },
      { logical: 'cat_highseverityissues',  label: 'High severity issues', kind: 'numeric' },
      { logical: 'cat_failedpatterns',      label: 'Failed patterns',      kind: 'numeric' },
      { logical: 'cat_passedpatterns',      label: 'Passed patterns',      kind: 'numeric' },
      { logical: 'cat_totalpatterns',       label: 'Total patterns',       kind: 'numeric' },
      { logical: 'cat_agenttype',           label: 'Agent type',           kind: 'categorical' },
      { logical: 'cat_reviewstatus',        label: 'Review status',        kind: 'categorical' },
    ],
  },
  {
    logical: 'cat_copilottest',
    label: 'Agent tests',
    description: 'Individual test case definitions for automated agent testing.',
    category: 'Testing',
    fields: [
      { logical: 'cat_copilottestid',          label: 'Record id (count)',   kind: 'id' },
      { logical: 'cat_critical',               label: 'Critical',            kind: 'boolean' },
      { logical: 'cat_order',                  label: 'Order',               kind: 'numeric' },
      { logical: 'cat_passthreshold',          label: 'Pass threshold %',    kind: 'numeric' },
      { logical: 'cat_secondsbeforegettinganswer', label: 'Seconds before answer', kind: 'numeric' },
      { logical: 'cat_expectedpositionoftheresponseactivity', label: 'Expected response position', kind: 'numeric' },
      { logical: 'cat_passinggradecode',       label: 'Passing grade',       kind: 'categorical' },
      { logical: 'cat_testtypecode',           label: 'Test type',           kind: 'categorical' },
      { logical: 'cat_operationtypecode',      label: 'Operation type',      kind: 'categorical' },
      { logical: 'cat_expectedtopicname',      label: 'Expected topic name', kind: 'categorical' },
      { logical: 'cat_name',                   label: 'Test name',           kind: 'text' },
    ],
  },
  {
    logical: 'cat_copilottestresult',
    label: 'Agent test results',
    description: 'Individual test execution results with latency, alignment, and grading.',
    category: 'Testing',
    fields: [
      { logical: 'cat_copilottestresultid',    label: 'Record id (count)',         kind: 'id' },
      { logical: 'cat_latencyms',              label: 'Latency (ms)',              kind: 'numeric' },
      { logical: 'cat_alignmentpercentage',    label: 'Alignment %',               kind: 'numeric' },
      { logical: 'cat_aibuildercreditconsumed', label: 'AI Builder credit consumed', kind: 'numeric' },
      { logical: 'cat_recognizedintentscore',  label: 'Recognized intent score',   kind: 'numeric' },
      { logical: 'cat_expectedpositionoftheresponseactivity', label: 'Expected response position', kind: 'numeric' },
      { logical: 'cat_passthreshold',          label: 'Pass threshold %',          kind: 'numeric' },
      { logical: 'cat_resultcode',             label: 'Result',                    kind: 'categorical' },
      { logical: 'cat_aigradecode',            label: 'AI grade',                  kind: 'categorical' },
      { logical: 'cat_humangradecode',         label: 'Human grade',               kind: 'categorical' },
      { logical: 'cat_testtypecode',           label: 'Test type',                 kind: 'categorical' },
      { logical: 'cat_recognizedtopicname',    label: 'Triggered topic',           kind: 'categorical' },
      { logical: 'cat_markedasexample',        label: 'Marked as example',         kind: 'boolean' },
    ],
  },
  {
    logical: 'cat_copilottestrun',
    label: 'Agent test runs',
    description: 'Aggregated test run results — pass/fail counts, success rate, latency, and cost.',
    category: 'Testing',
    fields: [
      { logical: 'cat_copilottestrunid',              label: 'Record id (count)',          kind: 'id' },
      { logical: 'cat_tests',                         label: '# Tests',                    kind: 'numeric' },
      { logical: 'cat_success',                       label: '# Success',                  kind: 'numeric' },
      { logical: 'cat_failed',                        label: '# Failed',                   kind: 'numeric' },
      { logical: 'cat_error',                         label: '# Error',                    kind: 'numeric' },
      { logical: 'cat_pending',                       label: '# Pending',                  kind: 'numeric' },
      { logical: 'cat_unknown',                       label: '# Unknown',                  kind: 'numeric' },
      { logical: 'cat_successrate',                   label: 'Success rate (%)',            kind: 'numeric' },
      { logical: 'cat_averagealignmentpercentage',    label: 'Average alignment %',        kind: 'numeric' },
      { logical: 'cat_averagelatencyms',              label: 'Average latency (ms)',       kind: 'numeric' },
      { logical: 'cat_totalaibuildercreditconsumed',  label: 'Total AI credit consumed',   kind: 'numeric' },
      { logical: 'cat_runstatuscode',                 label: 'Run status',                 kind: 'categorical' },
      { logical: 'cat_passinggradecode',              label: 'Passing grade',              kind: 'categorical' },
    ],
  },
];

/** Look up a table by its logical name (accepts plural entity-set too). */
export function findTable(logical: string | undefined): SchemaTable | undefined {
  if (!logical) return undefined;
  return schemaCatalog.find(t => t.logical === logical || `${t.logical}s` === logical || `${t.logical}es` === logical);
}

/** Return a human label for a table logical name; falls back to the raw string. */
export function tableLabel(logical: string | undefined): string {
  return findTable(logical)?.label ?? logical ?? '—';
}

/** Return a human label for a field on a given table; falls back to the raw string. */
export function fieldLabel(tableLogical: string | undefined, fieldLogical: string | undefined): string {
  if (!fieldLogical) return '—';
  const t = findTable(tableLogical);
  const f = t?.fields.find(x => x.logical === fieldLogical);
  return f?.label ?? fieldLogical;
}
