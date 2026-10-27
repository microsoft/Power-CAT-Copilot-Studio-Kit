import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Spinner, Textarea, Tooltip } from "@fluentui/react-components";
import {
  ArrowMaximizeRegular, ArrowSync16Regular, CheckmarkCircle16Filled, Delete16Regular,
  Edit16Regular, ErrorCircle16Filled, Open16Regular,
} from "@fluentui/react-icons";
import type { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { useMcpApp } from "../shared/McpAppProvider";
import { hostToolCallId, simulatedStepMs, useSimulatedPlayback } from "../shared/simulatedProgress";
import type { EvaluationCase, EvaluationDraft, EvaluationSaveReceipt, NativeEvaluationInput } from "../../evaluation/contracts";
import {
  DISPLAY_UNAVAILABLE, FIXED_BOX_HEIGHT, GENERATED_LAYOUT, generatedPreview, loaderSkeletonCount, previewCaption, useInlineFit, viewAllLabel,
} from "./inlineFit";

const studioUrlSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "copilotstudio.microsoft.com";
});
const receiptSchema = z.object({
  state: z.enum(["saved", "unconfirmed"]), verified: z.boolean(), requestId: z.string(), setId: z.string(),
  caseIds: z.array(z.string()), message: z.string(), studioUrl: studioUrlSchema,
});
const generatedSchema = z.object({
  state: z.string(),
  draft: z.object({ id: z.string(), cases: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough().optional(),
  studioUrl: studioUrlSchema.optional(),
  sampledConversations: z.number().int().nonnegative().optional(),
  receipt: receiptSchema.optional(),
  existingSet: z.object({ setId: z.string(), name: z.string() }).passthrough().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
}).passthrough();

type CaseState = { question: string; expected: string; savedQuestion: string; savedExpected: string; status: "idle" | "saving" | "error" | "auth"; removed: boolean };
type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;

const SAVE_HINT = "Retry saves to the same set. It does not create another set.";
const CHECK_HINT = "Retry checks the saved set. It does not create another set.";
/** Shown instead of the server message, which names a button that this view does not have. */
const UNCONFIRMED = `The save could not be confirmed. ${CHECK_HINT}`;
const AUTH_TEXT = "The change was not saved. Your sign-in may have expired. The saved set did not change. You can edit the set in Copilot Studio.";
const AUTH_UNCONFIRMED = `The save could not be confirmed. Your sign-in may have expired. The saved set did not change. You can edit the set in Copilot Studio. ${CHECK_HINT}`;
const EMPTY_CASE = "A case needs a question and an expected response. The saved text was kept.";
const AUTH_PATTERN = /AUTH_REQUIRED|\b401\b|unauthori[sz]ed|MCP error -32000/i;
/** Demo pacing: the generating loader shows for 3 steps before the cases. */
const SIMULATED_GENERATION_STEPS = 3;

class ToolFailure extends Error {
  auth: boolean;
  constructor(message: string, auth: boolean) { super(message); this.auth = auth; }
}

function failureOf(result: ToolResult, fallback: string): ToolFailure {
  const structured = result.structuredContent as { error?: { code?: unknown; message?: unknown } } | undefined;
  const item = result.content?.find(entry => entry.type === "text");
  const text = item && "text" in item && typeof item.text === "string" ? item.text : "";
  const message = (typeof structured?.error?.message === "string" ? structured.error.message : "") || text || fallback;
  return new ToolFailure(message, structured?.error?.code === "AUTH_REQUIRED" || AUTH_PATTERN.test(message));
}

function isAuthFailure(caught: unknown, message: string): boolean {
  return caught instanceof ToolFailure ? caught.auth : AUTH_PATTERN.test(message);
}

/** The set name is stable for a draft: its date comes from the draft, never from the current date. */
export function generatedSetName(draft: EvaluationDraft): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(draft.createdOn ?? "")?.[0];
  return `${draft.target.agent.name} – generated evals${day ? ` – ${day}` : ""}`.slice(0, 200);
}

/** One Copilot Studio set per generated draft: the request ID is the draft ID. */
function createInput(draft: EvaluationDraft, saveGrant: string): NativeEvaluationInput {
  return {
    draftId: draft.id, saveGrant, requestId: draft.id, name: generatedSetName(draft),
    method: "GeneralQualityGrader", confirmed: true,
    selectedCases: draft.cases.map(item => ({ caseId: item.id, expectedResponses: [item.turns[0]?.expectedResponse || item.turns[0]?.observedResponse || "Review this expected response."] })),
  };
}

function Loader({ text, skeletons }: { text: string; skeletons: number }) {
  return <div className="eval-gen-loader" role="status" aria-live="polite">
    <div className="eval-gen-orb"><Spinner size="medium" /></div>
    <strong>{text}</strong>
    <span className="eval-gen-muted">Reading recent saved conversations, removing duplicates and drafting test cases.</span>
    {skeletons > 0 && <div className="eval-gen-skeleton">
      {Array.from({ length: skeletons }, (_, index) => <div key={index} style={{ animationDelay: `${index * 120}ms` }} />)}
    </div>}
  </div>;
}

/** The bottom padding sits on the wrapper, so the textarea clips at the end of line 3. */
const FIXED_BOX_BOTTOM_PADDING = 7;

/** A fixed three-line box. The text scrolls inside it only on hover or focus; edits keep the same height. */
function EditableCell({ label, value, saved, locked, onChange, onCommit }: {
  label: string; value: string; saved: string; locked: boolean;
  onChange: (value: string) => void; onCommit: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !locked) {
    return <Textarea aria-label={label} value={value} autoFocus resize="none" rows={3} data-fixed-lines="3"
      className="eval-gen-textarea" style={{ height: FIXED_BOX_HEIGHT, paddingBottom: FIXED_BOX_BOTTOM_PADDING }}
      textarea={{ style: { height: "100%", minHeight: 0, maxHeight: "none", resize: "none" } }}
      onChange={(_, input) => onChange(input.value)}
      onBlur={() => { setEditing(false); onCommit(); }}
      onKeyDown={event => { if (event.key === "Escape") { onChange(saved); setEditing(false); } }} />;
  }
  const open = () => { if (!locked) setEditing(true); };
  return <div role="button" tabIndex={locked ? -1 : 0} aria-disabled={locked || undefined} aria-label={`Edit ${label}`}
    className={`eval-gen-cell${locked ? " locked" : ""}`} style={{ height: FIXED_BOX_HEIGHT }} onClick={open}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}>
    <div className="eval-gen-cell-text" data-fixed-lines="3">
      <span className={value.trim() ? undefined : "eval-gen-empty"}>{value.trim() || "Add text…"}</span>
    </div>
    {!locked && <Edit16Regular className="eval-gen-edit-icon" aria-hidden="true" />}
  </div>;
}

export function GeneratedEvaluationsApp() {
  const { app, data, metadata, replaceData, host } = useMcpApp();
  const fit = useInlineFit(host, app);
  const parsed = useMemo(() => generatedSchema.safeParse(data ?? { state: "loading" }), [data]);
  const current = parsed.success ? parsed.data : { state: "error", error: { message: "Eval Builder received invalid generated data. Nothing was saved." } };
  const draft = current.draft as EvaluationDraft | undefined;
  const grant = typeof metadata?.evaluationSaveGrant === "string" ? metadata.evaluationSaveGrant : "";
  // Demo pacing: a final result first shows the generating loader, with timers only.
  const record = data && typeof data === "object" ? data as Record<string, unknown> : undefined;
  const simulatedStep = simulatedStepMs(record?.simulatedProgress);
  const simulation = useSimulatedPlayback(
    simulatedStep && draft ? `evaluation:${typeof record?.selectionId === "string" ? record.selectionId : ""}:${draft.id}` : undefined,
    simulatedStep, SIMULATED_GENERATION_STEPS, hostToolCallId(host),
  );
  const shown = simulation ? undefined : draft;
  const [cases, setCases] = useState<Record<string, CaseState>>({});
  const [receipt, setReceipt] = useState<EvaluationSaveReceipt | undefined>(current.receipt as EvaluationSaveReceipt | undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const receiptRef = useRef<EvaluationSaveReceipt | undefined>(receipt);
  const saveInFlight = useRef(false);
  const started = useRef("");
  const latest = useRef<Record<string, CaseState>>({});
  latest.current = cases;

  const order = draft?.cases ?? [];
  const kept = order.filter(item => cases[item.id] && !cases[item.id].removed);

  const accept = (value: EvaluationSaveReceipt) => {
    receiptRef.current = value;
    setReceipt(value);
    replaceData({ ...current, receipt: value });
  };

  /** One call per mount or Retry click: create, or a read-only check when the latest receipt is unconfirmed. */
  const save = async (mode: "create" | "check") => {
    if (!app || !draft || !grant || !draft.cases.length || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true); setError("");
    try {
      const result = mode === "check"
        ? await app.callServerTool({ name: "get_agent_evaluation_save", arguments: { draftId: draft.id, requestId: draft.id, saveGrant: grant } })
        : await app.callServerTool({ name: "create_agent_evaluation_set", arguments: { ...createInput(draft, grant) } });
      const value = receiptSchema.safeParse((result.structuredContent as { receipt?: unknown } | undefined)?.receipt);
      if (!value.success) throw failureOf(result, "The evaluation set could not be saved.");
      accept(value.data);
      if (!value.data.verified) setError(UNCONFIRMED);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The evaluation set could not be saved.";
      const unconfirmed = receiptRef.current?.verified === false;
      setError(isAuthFailure(caught, message)
        ? unconfirmed ? AUTH_UNCONFIRMED : `${AUTH_TEXT} ${SAVE_HINT}`
        : `${message} ${unconfirmed ? CHECK_HINT : SAVE_HINT}`);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };
  const retry = () => void save(receiptRef.current && !receiptRef.current.verified ? "check" : "create");

  useEffect(() => {
    if (!draft || started.current === draft.id) return;
    started.current = draft.id;
    setCases(Object.fromEntries(draft.cases.map(item => {
      const question = item.turns[0]?.question ?? item.question;
      const expected = item.turns[0]?.expectedResponse || item.turns[0]?.observedResponse || "";
      return [item.id, { question, expected, savedQuestion: question, savedExpected: expected, status: "idle", removed: false }];
    })));
    const known = current.receipt as EvaluationSaveReceipt | undefined;
    if (known) { receiptRef.current = known; setReceipt(known); }
    if (known?.verified) return;
    void save("create");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const update = (id: string, change: Partial<CaseState>) => setCases(value => ({ ...value, [id]: { ...value[id], ...change } }));
  const sync = async (id: string, remove = false) => {
    const state = latest.current[id];
    if (!app || !draft || !grant || !receiptRef.current?.verified || !state) return;
    const question = state.question.trim();
    const expected = state.expected.trim();
    if (!remove && question === state.savedQuestion.trim() && expected === state.savedExpected.trim()) return;
    if (!remove && (!question || !expected)) { update(id, { question: state.savedQuestion, expected: state.savedExpected }); setError(EMPTY_CASE); return; }
    update(id, { status: "saving" }); setError("");
    try {
      const result = await app.callServerTool({ name: "update_agent_evaluation_case", arguments: {
        draftId: draft.id, saveGrant: grant, requestId: draft.id, caseId: id,
        question, expectedResponse: expected, ...(remove ? { remove: true } : {}),
      } });
      const value = receiptSchema.safeParse((result.structuredContent as { receipt?: unknown } | undefined)?.receipt);
      if (result.isError || !value.success) throw failureOf(result, "The change could not be saved.");
      accept(value.data);
      update(id, remove ? { removed: true, status: "idle" } : { savedQuestion: question, savedExpected: expected, status: "idle" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The change could not be saved.";
      const auth = isAuthFailure(caught, message);
      update(id, { status: auth ? "auth" : "error" });
      setError(auth ? AUTH_TEXT : message);
    }
  };

  const studioUrl = receipt?.studioUrl ?? current.studioUrl;
  const existing = Boolean(current.existingSet);
  const subtitle = shown && existing
    ? `${kept.length} saved test ${kept.length === 1 ? "case" : "cases"} for ${shown.target.agent.name}.`
    : shown
    ? `${kept.length} test ${kept.length === 1 ? "case" : "cases"} from ${current.sampledConversations ?? 0} recent saved ${current.sampledConversations === 1 ? "conversation" : "conversations"} of ${shown.target.agent.name}.`
    : "Copilot Agent Kit · evaluation cases from saved conversations";
  const openStudio = async () => {
    if (!studioUrl) return;
    setError("");
    try {
      if (!app?.getHostCapabilities()?.openLinks) throw new Error("This host does not support opening links.");
      const result = await app.openLink({ url: studioUrl });
      if (result.isError) throw new Error("The host could not open Copilot Studio.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Copilot Studio could not be opened."); }
  };
  const inline = fit.inline;
  const errorMessage = error || (current.state === "error" || current.error ? current.error?.message ?? "" : "");
  const locked = saving || !receipt?.verified;

  const L = GENERATED_LAYOUT;
  const errorBlock = errorMessage ? L.error + L.gap : 0;
  const preview = generatedPreview({
    contentHeight: fit.contentHeight, total: kept.length, error: Boolean(errorMessage), unavailable: fit.unavailable, refused: fit.refused, page,
  });
  const skeletons = inline ? loaderSkeletonCount(fit.contentHeight - errorBlock) : 4;
  const modeledHeight = !shown
    ? current.state === "error" ? L.padding + L.header + errorBlock : L.loaderBase + errorBlock + skeletons * L.skeleton
    : order.length === 0 ? L.padding + L.header + errorBlock + L.gap + 32 : preview.height;
  const rows = inline ? kept.slice(preview.start, preview.end) : kept;
  const offset = inline ? preview.start : 0;
  const footer = inline && shown && kept.length > 0 && (preview.preview || fit.refused);

  return <main className={`evaluation-builder eval-gen ${inline ? "is-inline" : "is-fullscreen"}`} aria-label="Generated evaluations"
    style={inline ? { maxHeight: fit.contentHeight } : undefined}
    data-inline-budget={inline ? fit.budget : undefined} data-inline-height={inline ? modeledHeight : undefined}>
    <header className="eval-gen-head">
      <div className="eval-gen-title"><h1>Evaluate</h1><p>{subtitle}</p></div>
      {studioUrl && !simulation && <Button appearance="primary" className="eval-gen-open" icon={<Open16Regular />} disabled={!receipt?.verified} onClick={() => void openStudio()}>Open in Copilot Studio</Button>}
      {/* Full screen relies on the host close control. */}
      {inline && <Tooltip content="Open fullscreen" relationship="label">
        <Button appearance="secondary" size="small" icon={<ArrowMaximizeRegular />}
          aria-label="Open fullscreen" onClick={() => void fit.requestFullscreen()} />
      </Tooltip>}
    </header>
    {errorMessage && <p className="evaluation-info evaluation-error" role="alert"><ErrorCircle16Filled className="evaluation-info-icon" aria-hidden="true" />
      <span title={inline ? errorMessage : undefined}>{errorMessage}</span>
      {!receipt?.verified && shown && <Button size="small" appearance="secondary" icon={<ArrowSync16Regular />} disabled={saving} onClick={retry}>Retry</Button>}</p>}
    {!shown ? (current.state === "error" ? null : <Loader text="Generating evals based on available transcripts…" skeletons={skeletons} />) : order.length === 0
      ? <p className="eval-gen-muted eval-gen-empty-note">No eligible saved conversations were found for this agent in the recent window. Nothing was saved.</p>
      : <section className="eval-gen-table" role="table" aria-label="Generated evaluation cases">
        <div className="eval-gen-row eval-gen-header" role="row">
          <span role="columnheader">#</span><span role="columnheader">Conversation</span><span role="columnheader">Expected response</span><span role="columnheader" aria-label="Actions" />
        </div>
        {rows.map((item: EvaluationCase, position) => {
          const index = offset + position;
          const state = cases[item.id];
          const edited = state.savedExpected !== (item.turns[0]?.expectedResponse || item.turns[0]?.observedResponse || "")
            || state.savedQuestion !== (item.turns[0]?.question ?? item.question);
          return <div key={item.id} role="row" className="eval-gen-row">
            <span className="eval-gen-index">{index + 1}</span>
            <div className="eval-gen-col">
              <EditableCell label={`question ${index + 1}`} value={state.question} saved={state.savedQuestion} locked={locked || state.status === "saving"}
                onChange={value => update(item.id, { question: value })} onCommit={() => void sync(item.id)} />
              <div className="eval-gen-meta">
                {item.outcome === "recorded-failure" && <Badge size="small" appearance="tint" color="danger">Recorded failure</Badge>}
                {!existing && <span>{item.path.length} recorded {item.path.length === 1 ? "step" : "steps"}</span>}
              </div>
            </div>
            <div className="eval-gen-col">
              <EditableCell label={`expected response ${index + 1}`} value={state.expected} saved={state.savedExpected} locked={locked || state.status === "saving"}
                onChange={value => update(item.id, { expected: value })} onCommit={() => void sync(item.id)} />
              <span className="eval-gen-source">
                {state.status === "saving" ? <><Spinner size="extra-tiny" /> Saving…</>
                  : state.status === "auth" ? "Not saved – sign-in may have expired"
                    : state.status === "error" ? "Not saved – edit again to retry"
                      : edited ? <><CheckmarkCircle16Filled aria-hidden="true" /> Edited · saved</> : existing ? "Saved in Copilot Studio" : "From recorded answer · review"}
              </span>
            </div>
            <Tooltip content="Delete from set" relationship="label">
              <Button appearance="subtle" size="small" aria-label="Delete from set" disabled={locked || state.status === "saving" || kept.length <= 1}
                icon={<Delete16Regular />} onClick={() => void sync(item.id, true)} />
            </Tooltip>
          </div>;
        })}
      </section>}
    {footer && <div className="eval-gen-footer">
      {preview.preview && <div className="eval-gen-footer-line">
        <span>{previewCaption(preview, kept.length, "cases", fit.unavailable)}</span>
        {fit.unavailable ? <>
          <Button size="small" appearance="secondary" disabled={preview.page <= 0} onClick={() => setPage(preview.page - 1)}>Previous page</Button>
          <Button size="small" appearance="secondary" disabled={preview.page >= preview.pages - 1} onClick={() => setPage(preview.page + 1)}>Next page</Button>
        </> : <Button size="small" appearance="secondary" onClick={() => void fit.requestFullscreen()}>{viewAllLabel(kept.length, "cases")}</Button>}
      </div>}
      {fit.unavailable && <span className="eval-gen-caption" role="status">{DISPLAY_UNAVAILABLE}</span>}
    </div>}
    {shown && order.length > 0 && receipt?.verified && <p className="eval-gen-muted eval-gen-note">Edits and deletions save as you go. No evaluation is run.</p>}
  </main>;
}
