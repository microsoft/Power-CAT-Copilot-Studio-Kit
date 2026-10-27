import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Tooltip, mergeClasses } from '@fluentui/react-components';
import {
  ArrowTurnRightDownRegular,
  BranchFork16Regular,
  Chat16Regular,
  ChevronDown16Regular,
  ChevronRight12Regular,
  ChevronUp16Regular,
  Clock16Regular,
  Dismiss16Regular,
  Filter16Regular,
  Info16Regular,
  Warning16Regular,
} from '@fluentui/react-icons';

import type { Activity, MCPServerInfo, ProcessedTranscript, ProcessedTurn, StepExecution } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { componentColor } from '../../theme/component-colors';
import { execTimeToMs, guessStepSubtitle, resolveExecutionTimeString, resolveStepName } from '../../utils/step-classification';
// The design formats every duration with fmtMs ("205 ms" / "6.30 s" / "1m 50s"),
// which differs from the host's formatDuration ("205ms" / "6.3s").
import { fmtMs as fmtDuration } from '../../utils/format-ms';
import { dedupeOutcome } from '../../utils/outcome';
import { GENERATIVE_THINKING_TASK_ID } from '../../utils/transcript/parse-generative-transcript';
import { activityTimestampMs, normalizeTimestampMs } from '../../utils/transcript/timestamp';
import { collectStepTypes } from '../../utils/timeline-insights';

/** A turn to open in the timeline. The message ID is preferred, because turn numbers depend on the session scope. */
export interface TimelineTurnTarget {
  turnNumber?: number;
  messageId?: string;
}

export interface PerformanceTimelineTabProps {
  transcript: ProcessedTranscript;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  onTurnSelect?: (messageId: string) => void;
  onTurnNavigate?: (tab: 'flow' | 'conversation', messageId: string) => void;
  /** Expands this turn and scrolls it into view. */
  focusTurn?: TimelineTurnTarget;
  onFocusHandled?: () => void;
}

type Vars = CSSProperties & { '--lvl'?: number; '--sd'?: number };
interface Entry { id: string; stepId: string; name: string; type: string; startMs: number; endMs: number; durationMs: number; failed: boolean; ownerId?: string; ownerName?: string; ownerType?: string; isAgentRoot?: boolean }
interface Idle { leftPct: number; widthPct: number }
interface Turn { n: number; messageId?: string; user: string; session: number; turnStartMs: number; turnEndMs: number; turnDurationMs: number; entries: Entry[]; idleIntervals: Idle[]; idleMs: number; failedCount: number }
interface Sess { n: number; key: string; startMs: number; endMs: number; durationMs: number; turnCount: number; outcome: string; gapFromPrevMs: number }
interface Model { turns: Turn[]; sessions: Sess[] }
interface Slowest { stepId: string | null; stepName: string; stepType: string; stepMs: number; stepTurn: number; messageId?: string }

const NON_TIMED = new Set(['P:CaptureContextTool', 'P:SendMessageTool', GENERATIVE_THINKING_TASK_ID]);
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const IDLE_MIN_MS = 50;
const timed = (e: StepExecution) => !!e.taskDialogId && !NON_TIMED.has(e.taskDialogId);
function ms(v: string | number | undefined) {
  return normalizeTimestampMs(v) ?? 0;
}
function activityMs(a: Activity) {
  return activityTimestampMs(a) ?? 0;
}
function fmtDate(value: number) { return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Unknown time'; }
function clip(s: string, n: number) { return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`; }
function isFailed(e: StepExecution) { const s = String(e.state ?? '').toLowerCase(); return ['failed', 'error', 'faulted', 'blocked'].includes(s) || !!e.errorMessage || !!e.blockedError; }
function typeOf(e: StepExecution, m?: Record<string, ComponentInfo>) { return e.subtitle?.trim() || guessStepSubtitle(e.taskDialogId, e.type, m?.[e.taskDialogId], e.observation) || 'Step'; }
function nameOf(e: StepExecution, m?: Record<string, ComponentInfo>) { return e.displayName?.trim() || resolveStepName(e.taskDialogId, m); }
function timing(e: StepExecution) { const s = resolveExecutionTimeString(e); const dur = s ? execTimeToMs(s) : 0; let start = ms(e.triggeredAt); if (!start) { const fin = ms(e.finishedAt); if (fin) start = dur > 0 ? fin - dur : fin; } if (!start) return null; let end = dur > 0 ? start + dur : ms(e.finishedAt); if (!end || end < start) end = start; return { start, end }; }
function sessionKey(t: ProcessedTurn) { return t.activities.find((a) => a.mergedSessionKey)?.mergedSessionKey; }
function fallbackMs(t: ProcessedTurn) { return ms(t.timestamp) || t.activities.map(activityMs).find(Boolean) || 0; }
function idle(entries: Entry[], start: number, end: number) { const active = entries.map((e) => [e.startMs, e.endMs] as [number, number]).filter(([s, f]) => f > s).sort((a, b) => a[0] - b[0]); const merged: Array<[number, number]> = []; for (const [s, f] of active) { const last = merged[merged.length - 1]; if (last && s <= last[1]) last[1] = Math.max(last[1], f); else merged.push([s, f]); } const raw: Array<[number, number]> = []; let cur = start; for (const [s, f] of merged) { if (s > cur) raw.push([cur, s]); cur = Math.max(cur, f); } if (end > cur) raw.push([cur, end]); const span = Math.max(1, end - start); return { intervals: raw.map(([s, f]) => ({ leftPct: ((s - start) / span) * 100, widthPct: Math.max(0.3, ((f - s) / span) * 100) })), idleMs: raw.reduce((sum, [s, f]) => sum + f - s, 0) }; }
function agentMap(agents?: ConnectedAgentInfo[]) { const map = new Map<string, ConnectedAgentInfo>(); for (const a of agents ?? []) { if (a.stepId) map.set(`step:${a.stepId}`, a); if (a.dialogSchemaName) map.set(`tdi:${a.dialogSchemaName}`, a); if (a.botSchemaName) map.set(`bot:${a.botSchemaName}`, a); } return map; }
function friendlyAgentName(a: ConnectedAgentInfo, e: StepExecution, m?: Record<string, ComponentInfo>) {
  return m?.[a.dialogSchemaName]?.modelDisplayName?.trim() || m?.[a.dialogSchemaName]?.name?.trim() || m?.[a.botSchemaName]?.modelDisplayName?.trim() || m?.[a.botSchemaName]?.name?.trim() || e.displayName?.trim() || a.displayName?.trim() || 'Connected agent';
}
function addAgentKids(out: Entry[], turnId: string, owner: StepExecution, agent: ConnectedAgentInfo, ownerName: string, m?: Record<string, ComponentInfo>) {
  for (const childTurn of agent.childTranscript ?? []) for (const e of childTurn.debugInfo?.stepExecutions ?? []) {
    if (!timed(e)) continue; const t = timing(e); if (!t) continue; const type = typeOf(e, m);
    out.push({ id: `${turnId}:child:${agent.sessionId || owner.stepId}:${e.taskDialogId}:${e.stepId}`, stepId: e.stepId, name: nameOf(e, m), type, startMs: t.start, endMs: t.end, durationMs: Math.max(0, t.end - t.start), failed: isFailed(e), ownerId: owner.stepId, ownerName, ownerType: type === 'Child agent' ? 'Child agent' : 'Connected agent' });
  }
}
function mcpEntries(turn: ProcessedTurn, m?: Record<string, ComponentInfo>): Entry[] {
  const servers: MCPServerInfo[] = turn.debugInfo?.mcpServers?.length ? turn.debugInfo.mcpServers : turn.debugInfo?.mcpServerInfo ? [turn.debugInfo.mcpServerInfo] : [];
  if (!servers.length || !turn.activities.some((a) => a.name === 'DynamicServerInitialize')) return [];
  return servers.flatMap((server) => {
    const schema = server.schemaName ?? '';
    const matches = (a: Activity) => { if (!schema) return true; const v = a.value; if (!v || typeof v !== 'object') return true; return String((v as Record<string, unknown>).dialogSchemaName ?? '') === schema; };
    const init = turn.activities.find((a) => a.name === 'DynamicServerInitialize' && matches(a)); if (!init) return [];
    const tools = turn.activities.find((a) => a.name === 'DynamicServerToolsList' && matches(a)); const start = activityMs(init); if (!start) return [];
    const end = Math.max(start, tools ? activityMs(tools) || start : start); const c = schema ? m?.[schema] : undefined;
    return [{ id: `${turn.id}:mcp:${schema || server.name}`, stepId: `mcp:${schema || server.name}`, name: c?.modelDisplayName?.trim() || c?.name?.trim() || server.name || 'MCP Server', type: 'MCP server', startMs: start, endMs: end, durationMs: Math.max(0, end - start), failed: false }];
  });
}
function entriesFor(turn: ProcessedTurn, m?: Record<string, ComponentInfo>, agents?: ConnectedAgentInfo[]) {
  const out: Entry[] = []; const agentsByKey = agentMap(agents);
  for (const e of turn.debugInfo?.stepExecutions ?? []) {
    if (!timed(e)) continue; const t = timing(e); if (!t) continue; const type = typeOf(e, m); const isAgentRoot = type === 'Connected agent' || type === 'Child agent';
    const entry: Entry = { id: `${turn.id}:${e.taskDialogId}:${e.stepId}`, stepId: e.stepId, name: nameOf(e, m), type, startMs: t.start, endMs: t.end, durationMs: Math.max(0, t.end - t.start), failed: isFailed(e), isAgentRoot };
    if (e.parentStepKey) { entry.ownerId = e.parentStepKey.split(':').pop() || e.parentStepKey; entry.ownerName = 'Child steps'; entry.ownerType = 'Agent'; }
    out.push(entry);
    if (!isAgentRoot) continue;
    const agent = agentsByKey.get(`step:${String(e.stepId)}`) ?? agentsByKey.get(`tdi:${e.taskDialogId}`) ?? agentsByKey.get(`bot:${e.taskDialogId}`);
    if (agent) addAgentKids(out, turn.id, e, agent, friendlyAgentName(agent, e, m), m);
  }
  out.push(...mcpEntries(turn, m)); out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs); return out;
}
/**
 * Groups the transcript into timeline rows.
 *
 * A row spans one user turn plus every assistant turn that follows it, because
 * `stepExecutions` are attached to whichever turn the parser flushed them on:
 * the classic and generative parsers both attach to the *user* turn, while
 * pre-turn steps can land on an assistant turn. Collecting the whole exchange
 * mirrors `PerformanceWaterfall`, which reads execs off every turn regardless
 * of role. Transcripts that open with assistant turns (a greeting) still get a
 * leading row so their steps are never dropped.
 */
function buildModel(transcript: ProcessedTranscript, m?: Record<string, ComponentInfo>, agents?: ConnectedAgentInfo[]): Model {
  const keyToNumber = new Map<string, number>(); const bounds = new Map<number, { key: string; start: number; end: number; count: number }>(); const turns: Turn[] = [];
  const sessionNo = (key: string) => { const old = keyToNumber.get(key); if (old) return old; const next = keyToNumber.size + 1; keyToNumber.set(key, next); return next; };

  const groups: Array<{ user: string; messageId?: string; key: string; source: ProcessedTurn[] }> = [];
  let pendingKey: string | undefined;
  for (const turn of transcript.turns) {
    const key = sessionKey(turn) ?? pendingKey ?? 'session-1';
    pendingKey = key;
    if (turn.role === 'user' || !groups.length) {
      groups.push({ user: turn.role === 'user' ? turn.content : '', messageId: turn.role === 'user' ? turn.id : undefined, key, source: [turn] });
    } else {
      groups[groups.length - 1].source.push(turn);
    }
  }

  for (const group of groups) {
    const n = turns.length + 1; const session = sessionNo(group.key);
    const entries = group.source.flatMap((t) => entriesFor(t, m, agents)).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    // A transcript that opens with an agent greeting yields a leading group with
    // no user message. Drop it when it carries no steps either, so the timeline
    // starts at Turn 1 = the first real user turn as the design does.
    if (!group.user && !entries.length) continue;
    const fb = group.source.map(fallbackMs).find(Boolean) ?? 0;
    const start = entries.length ? Math.min(...entries.map((e) => e.startMs)) : fb; const end = entries.length ? Math.max(...entries.map((e) => e.endMs)) : fb; const duration = Math.max(0, end - start); const idleInfo = idle(entries, start, end || start);
    turns.push({ n, messageId: group.messageId, user: group.user, session, turnStartMs: start, turnEndMs: end, turnDurationMs: duration, entries, idleIntervals: idleInfo.idleMs >= IDLE_MIN_MS ? idleInfo.intervals : [], idleMs: idleInfo.idleMs, failedCount: entries.filter((e) => e.failed).length });
    const b = bounds.get(session); if (b) { b.start = Math.min(b.start || start, start || b.start); b.end = Math.max(b.end, end || start); b.count += 1; } else bounds.set(session, { key: group.key, start, end: end || start, count: 1 });
  }
  const ordered = Array.from(bounds.entries()).sort(([a], [b]) => a - b);
  const outcome = dedupeOutcome(transcript.generalInfo.outcome || 'Unknown');
  return { turns, sessions: ordered.map(([n, b], i): Sess => ({ n, key: b.key, startMs: b.start, endMs: b.end, durationMs: Math.max(0, b.end - b.start), turnCount: b.count, outcome, gapFromPrevMs: i ? Math.max(0, b.start - ordered[i - 1][1].end) : 0 })) };
}
function scopedSlowest(turns: Turn[]): Slowest { let step: Entry | undefined; let stepTurn: Turn | undefined; for (const t of turns) { for (const e of t.entries) if (!step || e.durationMs > step.durationMs) { step = e; stepTurn = t; } } if (!step || !stepTurn) return { stepId: null, stepName: '', stepType: '', stepMs: 0, stepTurn: 0 }; return { stepId: step.id, stepName: step.name, stepType: step.type, stepMs: step.durationMs, stepTurn: stepTurn.n, messageId: stepTurn.messageId }; }
function pct(n: number) { return `${Math.max(0, Math.min(100, n)).toFixed(3)}%`; }
/** `.exp` — expandIcon slot. Branches get a rotating chevron; leaves reserve the same width via `.exp.leaf` so labels stay aligned. */
function renderExpandIcon(branch: boolean) { return branch ? <span className="exp" aria-hidden="true"><ChevronRight12Regular className="w-ic" /></span> : <span className="exp leaf" aria-hidden="true" />; }
/** The performance timeline: a legend, the slowest step and every turn expanded with its step rows. */
export function PerformanceTimelineTab({ transcript, componentNameBySchemaName, connectedAgents, onTurnSelect, onTurnNavigate, focusTurn, onFocusHandled }: PerformanceTimelineTabProps) {
  const treeRef = useRef<HTMLDivElement | null>(null); const pendingFocusRef = useRef<string | null>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set()); const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(new Set()); const [collapsedStepKeys, setCollapsedStepKeys] = useState<Set<string>>(new Set());
  const [sessionScope, setSessionScope] = useState<number | null>(null); const [selectedTurn, setSelectedTurn] = useState(1); const [treeFocus, setTreeFocus] = useState<string | null>(null); const [flashEntry, setFlashEntry] = useState<string | null>(null);
  const model = useMemo(() => buildModel(transcript, componentNameBySchemaName, connectedAgents), [transcript, componentNameBySchemaName, connectedAgents]);
  // The design opens every turn on load (`STATE.expanded = new Set(turns.map(t => t.n))`),
  // so the waterfall is visible without a click. Re-seed whenever the model changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setExpandedTurns(new Set(model.turns.map((t) => t.n))); }, [model]);
  const visibleTurns = useMemo(() => model.turns.filter((t) => sessionScope === null || t.session === sessionScope), [model.turns, sessionScope]);
  const stepTypes = collectStepTypes(transcript.turns);
  const slowest = useMemo(() => scopedSlowest(visibleTurns), [visibleTurns]); const slowestEntryId = slowest.stepId;
  const treeItems = useCallback((): HTMLElement[] => treeRef.current ? Array.from(treeRef.current.querySelectorAll<HTMLElement>('[role="treeitem"]')) : [], []);
  const focusTreeItem = useCallback((id: string | null) => { const items = treeItems(); if (!items.length) return; const target = (id ? items.find((x) => x.dataset.tv === id) : undefined) ?? items[0]; for (const item of items) item.tabIndex = item === target ? 0 : -1; target.focus({ preventScroll: true }); setTreeFocus(target.dataset.tv ?? null); }, [treeItems]);
  useEffect(() => { const items = treeItems(); if (!items.length) return; const target = items.find((x) => x.dataset.tv === (pendingFocusRef.current ?? treeFocus)) ?? items[0]; for (const item of items) item.tabIndex = item === target ? 0 : -1; pendingFocusRef.current = null; }, [treeItems, treeFocus, model, expandedTurns, collapsedSessions, collapsedStepKeys, sessionScope]);
  // Opens a requested turn (a stored full-screen intent): the message ID wins,
  // because turn numbers are stable only for the same transcript.
  const onFocusHandledRef = useRef(onFocusHandled);
  useEffect(() => { onFocusHandledRef.current = onFocusHandled; });
  const focusMessageId = focusTurn?.messageId; const focusTurnNumber = focusTurn?.turnNumber;
  useEffect(() => {
    if (focusMessageId === undefined && focusTurnNumber === undefined) return undefined;
    const target = (focusMessageId ? model.turns.find((t) => t.messageId === focusMessageId) : undefined)
      ?? (focusTurnNumber !== undefined ? model.turns.find((t) => t.n === focusTurnNumber) : undefined);
    if (!target) { onFocusHandledRef.current?.(); return undefined; }
    const tv = `t${target.n}`;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSessionScope((scope) => (scope === null || scope === target.session ? scope : null));
    setCollapsedSessions((previous) => { if (!previous.has(target.session)) return previous; const next = new Set(previous); next.delete(target.session); return next; });
    setSelectedTurn(target.n);
    setExpandedTurns((previous) => (previous.has(target.n) ? previous : new Set(previous).add(target.n)));
    setTreeFocus(tv);
    /* eslint-enable react-hooks/set-state-in-effect */
    pendingFocusRef.current = tv;
    const timer = window.setTimeout(() => {
      treeRef.current?.querySelector<HTMLElement>(`[data-tv="${tv}"]`)?.scrollIntoView({ block: 'start' });
      focusTreeItem(tv);
      onFocusHandledRef.current?.();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [focusMessageId, focusTurnNumber, model, focusTreeItem]);
  const treeIsOpen = useCallback((id: string) => { const key = id.slice(1); if (id[0] === 's') return !collapsedSessions.has(Number(key)); if (id[0] === 't') return expandedTurns.has(Number(key)); if (id[0] === 'w') return !collapsedStepKeys.has(key); return false; }, [collapsedSessions, collapsedStepKeys, expandedTurns]);
  const treeSetOpen = useCallback((id: string, open: boolean) => {
    const key = id.slice(1);
    if (id[0] === 's') {
      setCollapsedSessions((previous) => {
        const next = new Set(previous);
        if (open) next.delete(Number(key));
        else next.add(Number(key));
        return next;
      });
    } else if (id[0] === 't') {
      const turnNo = Number(key);
      setSelectedTurn(turnNo);
      setExpandedTurns((previous) => {
        const next = new Set(previous);
        if (open) next.add(turnNo);
        else next.delete(turnNo);
        return next;
      });
    } else if (id[0] === 'w') {
      setCollapsedStepKeys((previous) => {
        const next = new Set(previous);
        if (open) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    pendingFocusRef.current = id;
    setTreeFocus(id);
    window.requestAnimationFrame(() => focusTreeItem(id));
  }, [focusTreeItem]);
  const toggleTreeItem = useCallback((event: MouseEvent<HTMLElement>, id: string) => { event.stopPropagation(); treeSetOpen(id, !treeIsOpen(id)); }, [treeIsOpen, treeSetOpen]);
  const handleTreeKey = useCallback((event: KeyboardEvent<HTMLDivElement>) => { const cur = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]'); if (!cur) return; const items = treeItems(); const i = items.indexOf(cur); const id = cur.dataset.tv; const branch = cur.hasAttribute('aria-expanded'); const open = cur.getAttribute('aria-expanded') === 'true'; const go = (n: number) => { const el = items[n]; if (!el) return; for (const item of items) item.tabIndex = -1; el.tabIndex = 0; el.focus(); setTreeFocus(el.dataset.tv ?? null); };
    switch (event.key) { case 'ArrowRight': if (event.altKey) return; event.preventDefault(); if (branch && !open && id) treeSetOpen(id, true); else go(i + 1); return; case 'ArrowLeft': { if (event.altKey) return; event.preventDefault(); if (branch && open && id) { treeSetOpen(id, false); return; } const lvl = Number(cur.getAttribute('aria-level')); for (let j = i - 1; j >= 0; j -= 1) if (Number(items[j].getAttribute('aria-level')) < lvl) { go(j); return; } return; } case 'ArrowDown': event.preventDefault(); go(i + 1); return; case 'ArrowUp': event.preventDefault(); go(i - 1); return; case 'Home': event.preventDefault(); go(0); return; case 'End': event.preventDefault(); go(items.length - 1); return; case 'Enter': case ' ': if (branch && id) { event.preventDefault(); treeSetOpen(id, !open); } } }, [treeItems, treeSetOpen]);
  const expandTargets = useCallback(() => ({ bands: sessionScope === null && model.sessions.length > 1 ? model.sessions.filter((s) => visibleTurns.some((t) => t.session === s.n)).map((s) => s.n) : [], rows: visibleTurns.filter((t) => t.entries.length).map((t) => t.n) }), [model.sessions, sessionScope, visibleTurns]);
  const allExpanded = useMemo(() => { const { bands, rows } = expandTargets(); return bands.every((n) => !collapsedSessions.has(n)) && rows.every((n) => expandedTurns.has(n)); }, [collapsedSessions, expandedTurns, expandTargets]);
  const toggleAll = () => { const { bands, rows } = expandTargets(); if (allExpanded) { setCollapsedSessions((p) => new Set([...p, ...bands])); setExpandedTurns((p) => { const n = new Set(p); rows.forEach((r) => n.delete(r)); return n; }); } else { setCollapsedSessions((p) => { const n = new Set(p); bands.forEach((b) => n.delete(b)); return n; }); setExpandedTurns((p) => new Set([...p, ...rows])); } };
  const jumpToSlowest = () => { if (!slowest.stepId || !slowest.stepTurn) return; const t = model.turns.find((x) => x.n === slowest.stepTurn); if (t && model.sessions.length > 1) setSessionScope(t.session); setSelectedTurn(slowest.stepTurn); setExpandedTurns((p) => new Set(p).add(slowest.stepTurn)); setCollapsedStepKeys(new Set()); setFlashEntry(slowest.stepId); pendingFocusRef.current = `e${slowest.stepId}`; window.setTimeout(() => { const el = treeRef.current?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(slowest.stepId ?? '')}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); focusTreeItem(`e${slowest.stepId}`); window.setTimeout(() => setFlashEntry(null), 1500); }, 60); if (slowest.messageId && onTurnSelect) onTurnSelect(slowest.messageId); };
  const visibleSession = sessionScope ? model.sessions.find((s) => s.n === sessionScope) : undefined;
  /** `.w-legend` — component colour key plus the fixed Idle/Slowest swatches. */
  const renderLegend = () => (
    <div className="w-legend" aria-label="Component colour key">
      {stepTypes.map((type) => (
        <span key={type}><i className="w-dot" style={{ background: componentColor(type) }} aria-hidden="true" />{type}</span>
      ))}
      <span><i className="w-idle" style={{ position: 'static', display: 'inline-block', width: 16, height: 8, borderRadius: 2 }} aria-hidden="true" />Idle</span>
      <span><i className="w-dot slowest" aria-hidden="true" />Slowest</span>
    </div>
  );
  /** `.w-slowest` — summary and direct navigation for the slowest timed step. */
  const renderSlowestCallout = () => slowestEntryId ? (
    <div className="w-slowest" role="status">
      <span className="ico" aria-hidden="true"><Warning16Regular className="w-ic" /></span>
      <div className="txt">
        <p className="t">Slowest step — <b>{slowest.stepName}</b> <span className="ty">{slowest.stepType}</span><span className="tn">Turn {slowest.stepTurn}</span><span className="dur">{fmtDuration(slowest.stepMs)}</span></p>
      </div>
      <Button appearance="transparent" className="w-btn subtle" type="button" onClick={jumpToSlowest}><ArrowTurnRightDownRegular className="w-ic" /> Go to slowest step</Button>
    </div>
  ) : null;
  /** `.w-scopebar` — current-session status banner. */
  const renderScopeBanner = () => visibleSession ? (
    <div className="w-scopebar" role="status">
      <Info16Regular className="w-ic" aria-hidden="true" />
      <span>Showing <b>session {visibleSession.n} of {model.sessions.length}</b> · {fmtDate(visibleSession.startMs)} · {visibleSession.turnCount} turn{visibleSession.turnCount === 1 ? '' : 's'}</span>
      <Button appearance="transparent" className="w-btn subtle" type="button" onClick={() => setSessionScope(null)}><Dismiss16Regular className="w-ic" aria-hidden="true" /> Show all sessions</Button>
    </div>
  ) : null;
  /** `.w-axis`, `.w-ticks` — per-turn axis. */
  const renderAxis = (turn: Turn) => <div className="w-axis"><div /><div className="w-ticks">{TICKS.map((t) => <span key={t}>{fmtDuration(turn.turnDurationMs * t)}</span>)}</div><div /></div>;
  /** `.w-ti.step`, `.w-tl.wf`, `.w-rowname`, `.w-track`, `.w-bar`, `.w-rowdur` — one waterfall row. */
  const renderStepRow = (turn: Turn, entry: Entry, o: { level: number; sd?: number; agent?: boolean; kids?: number; open?: boolean; branchKey?: string; last?: boolean; children?: ReactNode }) => {
    const branch = !!(o.agent && o.kids); const isSlowest = entry.id === slowestEntryId; const left = turn.turnDurationMs > 0 ? ((entry.startMs - turn.turnStartMs) / Math.max(1, turn.turnDurationMs)) * 100 : 0; const width = turn.turnDurationMs > 0 ? Math.max(0.4, (entry.durationMs / Math.max(1, turn.turnDurationMs)) * 100) : 0.4; const tv = branch && o.branchKey ? `w${o.branchKey}` : `e${entry.id}`;
    return (
      <div
        key={entry.id}
        className={mergeClasses('w-ti step', o.agent && 'agent', o.sd ? 'child' : undefined, o.last ? 'last' : undefined, entry.failed && 'failed', isSlowest && 'slowest', flashEntry === entry.id && 'flash')}
        data-entry={entry.id}
        data-tv={tv}
        role="treeitem"
        aria-level={o.level}
        aria-expanded={branch ? !!o.open : undefined}
        tabIndex={-1}
        title={`${entry.name} — ${entry.type} — ${fmtDuration(entry.durationMs)}${entry.failed ? ' — failed' : ''}`}
        style={{ '--lvl': o.level } as Vars}
        onClick={branch && o.branchKey ? (e) => toggleTreeItem(e, `w${o.branchKey}`) : undefined}
      >
        <div className="w-tl wf">
          <div className="w-rowname" style={{ '--sd': o.sd ?? 0 } as Vars}>
            {renderExpandIcon(branch)}
            <i className="w-dot" style={{ background: entry.failed ? 'var(--colorPaletteRedForeground1)' : componentColor(entry.type) }} aria-hidden="true" />
            <span className="nm">{entry.name}</span>
            {branch && o.kids ? <Badge appearance="filled" className="w-badge neutral kidn">{o.kids}</Badge> : null}
            {entry.failed ? <Badge appearance="filled" className="w-badge err stepfail"><Warning16Regular className="w-ic" aria-hidden="true" />Failed</Badge> : null}
            {isSlowest ? <Badge appearance="filled" className="w-badge slowest"><Warning16Regular className="w-ic" aria-hidden="true" />Slowest</Badge> : null}
          </div>
          <div className="w-track">
            {turn.idleIntervals.map((gap, i) => <div key={`${entry.id}:idle:${i}`} className="w-idle" style={{ left: pct(gap.leftPct), width: pct(gap.widthPct) }} />)}
            <div className={mergeClasses('w-bar', entry.failed && 'failed', entry.durationMs > 0 && isSlowest && 'slowest')} style={{ left: pct(left), width: pct(width), background: entry.failed ? 'var(--colorPaletteRedForeground1)' : componentColor(entry.type) }} role="img" aria-label={`${entry.name}: ${fmtDuration(entry.durationMs)}${entry.failed ? ' failed' : ''}`} />
          </div>
          <div className={mergeClasses('w-rowdur', entry.failed && 'failed', isSlowest && 'slowest')}>{fmtDuration(entry.durationMs)}</div>
        </div>
        {o.children ? <div className="w-grp kids" role="group">{o.children}</div> : null}
      </div>
    );
  };
  /** `.w-ti.step.agent.synthetic` — synthesised parent for owner-less child steps. */
  const renderSynthetic = (turn: Turn, ownerId: string, siblings: Entry[], level: number) => {
    const first = siblings[0]; const key = `${turn.n}:owner:${ownerId}`; const open = !collapsedStepKeys.has(key);
    return (
      <div key={key} className="w-ti step agent synthetic" role="treeitem" aria-level={level} aria-expanded={open} tabIndex={-1} data-tv={`w${key}`} style={{ '--lvl': level } as Vars} onClick={(e) => toggleTreeItem(e, `w${key}`)}>
        <div className="w-tl wf">
          <div className="w-rowname" style={{ '--sd': 0 } as Vars}>
            {renderExpandIcon(true)}
            <i className="w-dot" style={{ background: componentColor(first.ownerType) }} aria-hidden="true" />
            <span className="nm">{first.ownerName || 'Child steps'}</span>
            <Badge appearance="filled" className="w-badge neutral kidn">{siblings.length}</Badge>
          </div>
          <div className="w-track ghost" />
          <div className="w-rowdur">{first.ownerType || 'Agent'}</div>
        </div>
        {open ? <div className="w-grp kids" role="group">{siblings.map((e, i) => renderStepRow(turn, e, { level: level + 1, sd: 1, last: i === siblings.length - 1 }))}</div> : null}
      </div>
    );
  };
  const renderIdleRow = (turn: Turn, level: number) => (
    <div
      key={`${turn.n}:idle`}
      className="w-ti step idle"
      role="treeitem"
      aria-level={level}
      tabIndex={-1}
      data-tv={`i${turn.n}`}
      style={{ '--lvl': level } as Vars}
    >
      <div className="w-tl wf">
        <div className="w-rowname" style={{ '--sd': 0 } as Vars}>
          {renderExpandIcon(false)}
          <Clock16Regular className="w-ic" aria-hidden="true" />
          <span className="nm">Idle time</span>
        </div>
        <div className="w-track" role="img" aria-label={`Idle time: ${fmtDuration(turn.idleMs)}`}>
          {turn.idleIntervals.map((gap, index) => (
            <div
              key={`${turn.n}:idle:${index}`}
              className="w-idle"
              style={{ left: pct(gap.leftPct), width: pct(gap.widthPct) }}
            />
          ))}
        </div>
        <div className="w-rowdur">{fmtDuration(turn.idleMs)}</div>
      </div>
    </div>
  );
  const renderRows = (turn: Turn, level: number) => {
    const nodes: ReactNode[] = [];
    const consumed = new Set<number>();
    turn.entries.forEach((entry, index) => {
      if (consumed.has(index)) return;
      if (entry.isAgentRoot) {
        const kids: Entry[] = [];
        turn.entries.forEach((candidate, childIndex) => {
          if (childIndex !== index && candidate.ownerId === entry.stepId && !consumed.has(childIndex)) {
            kids.push(candidate);
            consumed.add(childIndex);
          }
        });
        const key = `${turn.n}:${entry.stepId}`;
        const open = kids.length === 0 || !collapsedStepKeys.has(key);
        nodes.push(renderStepRow(turn, entry, {
          level,
          sd: 0,
          agent: true,
          kids: kids.length,
          open,
          branchKey: key,
          children: open && kids.length
            ? kids.map((kid, i) => renderStepRow(turn, kid, { level: level + 1, sd: 1, last: i === kids.length - 1 }))
            : undefined,
        }));
        return;
      }
      if (entry.ownerId) {
        const siblings = [entry];
        consumed.add(index);
        turn.entries.forEach((candidate, childIndex) => {
          if (childIndex > index && candidate.ownerId === entry.ownerId && !consumed.has(childIndex)) {
            siblings.push(candidate);
            consumed.add(childIndex);
          }
        });
        nodes.push(renderSynthetic(turn, entry.ownerId, siblings, level));
        return;
      }
      nodes.push(renderStepRow(turn, entry, { level, sd: 0 }));
    });
    if (turn.idleIntervals.length) nodes.push(renderIdleRow(turn, level));
    return nodes;
  };
  /** `.w-ti.turn` — one turn row plus its `.w-grp.steps` subtree (rows + axis). */
  const renderTurn = (turn: Turn, level: number) => {
    const branch = turn.entries.length > 0; const open = branch && expandedTurns.has(turn.n); const tv = `t${turn.n}`;
    return (
      <div key={turn.n} className={mergeClasses('w-ti turn', selectedTurn === turn.n && 'sel')} role="treeitem" aria-level={level} aria-expanded={branch ? open : undefined} tabIndex={-1} data-tv={tv} style={{ '--lvl': level } as Vars} onClick={(e) => (branch ? toggleTreeItem(e, tv) : undefined)}>
        <div className="w-tl">
          {renderExpandIcon(branch)}
          <span className="main">
            <span className="l1">Turn {turn.n}</span>
            <span className="q">“{clip(turn.user, 110)}”</span>
            {turn.failedCount ? <Badge appearance="filled" className="w-badge err"><Warning16Regular className="w-ic" aria-hidden="true" /> {turn.failedCount} failed</Badge> : null}
          </span>
          <span className="aside">{branch ? fmtDuration(turn.turnDurationMs) : 'no steps'}</span>
          <span className="acts" role="toolbar" aria-label={`Turn ${turn.n} actions`}>
            {turn.messageId && onTurnNavigate ? (
              <>
                {/* A narrow turn row hides the text labels (overrides.css), so each action keeps its name and a tooltip. */}
                <Tooltip content="Execution flow" relationship="label">
                  <Button appearance="transparent" className="w-btn subtle" type="button" tabIndex={-1} aria-label="Execution flow" onClick={(e) => { e.stopPropagation(); onTurnNavigate('flow', turn.messageId as string); }}><BranchFork16Regular className="w-ic" aria-hidden="true" /><span className="w-act-label">Execution flow</span></Button>
                </Tooltip>
                <Tooltip content="Conversation" relationship="label">
                  <Button appearance="transparent" className="w-btn subtle" type="button" tabIndex={-1} aria-label="Conversation" onClick={(e) => { e.stopPropagation(); onTurnNavigate('conversation', turn.messageId as string); }}><Chat16Regular className="w-ic" aria-hidden="true" /><span className="w-act-label">Conversation</span></Button>
                </Tooltip>
              </>
            ) : null}
          </span>
        </div>
        {open ? <div className="w-grp steps" role="group">{renderRows(turn, level + 1)}{renderAxis(turn)}</div> : null}
      </div>
    );
  };
  /** `.w-ti.sess` — session row plus its `.w-grp` of turns. */
  const renderSession = (session: Sess) => {
    const open = !collapsedSessions.has(session.n); const sessionTurns = visibleTurns.filter((t) => t.session === session.n);
    return (
      <div key={session.n}>
        {session.gapFromPrevMs > 0 ? (
          <div className="w-idlegap" role="separator">
            <span><Clock16Regular className="w-ic" aria-hidden="true" /> user idle {fmtDuration(session.gapFromPrevMs)} — reconnected as a new session</span>
          </div>
        ) : null}
        <div className="w-ti sess" role="treeitem" aria-level={1} aria-expanded={open} tabIndex={-1} data-tv={`s${session.n}`} style={{ '--lvl': 1 } as Vars} onClick={(e) => toggleTreeItem(e, `s${session.n}`)}>
          <div className="w-tl">
            {renderExpandIcon(true)}
            <span className="ib" aria-hidden="true"><Clock16Regular className="w-ic" /></span>
            <span className="main">
              <span className="l1">Session {session.n}</span>
              <span className="dt">{fmtDate(session.startMs)}</span>
              <Badge appearance="filled" className={mergeClasses('w-badge', /resolved|success/i.test(session.outcome) ? 'ok' : 'neutral')}>{session.outcome}</Badge>
            </span>
            <span className="aside">{session.turnCount} turn{session.turnCount === 1 ? '' : 's'} · {fmtDuration(session.durationMs)}</span>
            <span className="acts" role="toolbar" aria-label={`Session ${session.n} actions`}>
              <Button appearance="transparent" className="w-btn subtle focus" type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSessionScope(session.n); }} title={`Scope every tab to session ${session.n}`}><Filter16Regular className="w-ic" aria-hidden="true" /> Focus</Button>
            </span>
          </div>
          {open ? <div className="w-grp" role="group">{sessionTurns.map((t) => renderTurn(t, 2))}</div> : null}
        </div>
      </div>
    );
  };
  const banded = sessionScope === null && model.sessions.length > 1; const treeBody = banded ? model.sessions.filter((s) => visibleTurns.some((t) => t.session === s.n)).map(renderSession) : visibleTurns.map((t) => renderTurn(t, 1));
  if (!model.turns.length) return (
    <section className="w-card">
      <header>
        <Button appearance="transparent" className="w-btn subtle" type="button" disabled><ChevronDown16Regular className="w-ic" /> Expand all</Button>
        <span style={{ flex: 1 }} />
        {renderLegend()}
      </header>
      <div className="w-muted">No timed steps were found in this transcript.</div>
    </section>
  );
  return (
    <section className="w-card">
      <header>
        <Button appearance="transparent" className="w-btn subtle" type="button" onClick={toggleAll}>{allExpanded ? <ChevronUp16Regular className="w-ic" /> : <ChevronDown16Regular className="w-ic" />} {allExpanded ? 'Collapse all' : 'Expand all'}</Button>
        <span style={{ flex: 1 }} />
        {renderLegend()}
      </header>
      {renderSlowestCallout()}
      {renderScopeBanner()}
      <div className="body">
        <div ref={treeRef} className="w-tree" role="tree" aria-label="Performance timeline" onKeyDown={handleTreeKey}>{treeBody}</div>
      </div>
    </section>
  );
}
