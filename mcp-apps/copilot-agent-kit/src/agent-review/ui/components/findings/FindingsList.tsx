import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Caption1,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Link,
  OverlayDrawer,
  Subtitle2,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  useId,
} from "@fluentui/react-components";
import {
  CheckmarkCircleFilled,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Dismiss20Regular,
  DismissCircleFilled,
  InfoFilled,
  OpenRegular,
  SparkleRegular,
  WarningFilled,
} from "@fluentui/react-icons";
import type { FindingView } from "../viewTypes.js";
import { resolveFindingRowFocus } from "./findingsGroupedModel.js";
import {
  FINDING_STATUS_HINT,
  FINDING_STATUS_LABEL,
  findingRows,
  type FindingStatus,
  type ReviewResultRow,
} from "./findingsListModel.js";

const STATUS_COLOR = {
  error: "danger", warning: "danger", info: "informative", passed: "success",
  "not-applicable": "informative", failed: "informative", recorded: "informative",
} as const;

const VERDICT_LABEL: Record<FindingStatus, string> = {
  error: "Fail", warning: "Fail", info: "Info", passed: "Pass",
  "not-applicable": "Not assessed", failed: "Could not run", recorded: "Recorded",
};

const useStyles = makeStyles({
  list: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS,
    minWidth: 0, margin: 0, padding: 0, listStyleType: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    width: "100%",
    textAlign: "left",
    font: "inherit",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":active": { backgroundColor: tokens.colorNeutralBackground1Pressed },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "-2px" },
  },
  selected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandStroke1}`,
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium, overflow: "hidden",
  },
  cardHeader: { border: 0, borderRadius: 0, padding: tokens.spacingHorizontalL },
  cardBody: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM,
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalL}`,
    minWidth: 0, overflowWrap: "anywhere",
  },
  recommendation: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  detailLink: { alignSelf: "flex-start", fontSize: tokens.fontSizeBase200 },
  main: {
    display: "flex", alignItems: "center", flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS, flexGrow: 1, minWidth: 0,
  },
  title: { fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  meta: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3, overflowWrap: "anywhere",
  },
  status: { flexShrink: 0 },
  drawer: { width: "420px", maxWidth: "100%", minWidth: 0, borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  body: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL, paddingBottom: tokens.spacingVerticalXXL,
    minWidth: 0, overflowWrap: "anywhere",
  },
  heading: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: tokens.spacingHorizontalM, minWidth: 0,
  },
  field: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS, minWidth: 0 },
  fieldLabel: { color: tokens.colorNeutralForeground3 },
  value: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  fact: {
    margin: 0, padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1, fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    whiteSpace: "pre-wrap", overflowWrap: "anywhere",
  },
  steps: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS,
    margin: 0, paddingLeft: tokens.spacingHorizontalXL,
  },
  references: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  reference: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: tokens.spacingVerticalXXS },
  referenceLink: { display: "flex", flexDirection: "column", overflowWrap: "anywhere", minWidth: 0 },
  details: {
    display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXXS, margin: 0,
    "& dt": { margin: 0, color: tokens.colorNeutralForeground3 },
    "& dd": { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  },
  disclaimer: {
    color: tokens.colorNeutralForeground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalS,
  },
  nav: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalM, marginTop: "auto",
  },
  empty: { padding: tokens.spacingVerticalXXL, textAlign: "center", color: tokens.colorNeutralForeground3 },
});

export function ResultStatus({ status }: { status: FindingStatus }) {
  const styles = useStyles();
  const verdict = status === "error" || status === "warning" || status === "passed";
  return (
    <Badge
      className={styles.status}
      appearance={verdict || status === "info" ? "tint" : "outline"}
      color={STATUS_COLOR[status]}
      title={FINDING_STATUS_LABEL[status]}
      icon={status === "passed" ? <CheckmarkCircleFilled /> : verdict ? <DismissCircleFilled /> : undefined}
    >
      {VERDICT_LABEL[status]}
    </Badge>
  );
}

export function FindingSeverityIcon({ status }: { status: FindingStatus }) {
  if (status === "error") return <DismissCircleFilled style={{ color: tokens.colorPaletteRedForeground1, flexShrink: 0 }} aria-hidden="true" />;
  if (status === "warning") return <WarningFilled style={{ color: tokens.colorPaletteDarkOrangeForeground1, flexShrink: 0 }} aria-hidden="true" />;
  return <InfoFilled style={{ color: tokens.colorPaletteBlueForeground2, flexShrink: 0 }} aria-hidden="true" />;
}

function ResultField({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <section className={styles.field} aria-label={label}>
      <Caption1 className={styles.fieldLabel}>{label}</Caption1>
      {typeof children === "string" ? <Text className={styles.value}>{children}</Text> : children}
    </section>
  );
}

function ResultFindingDetail({ finding }: { finding: FindingView }) {
  const styles = useStyles();
  const references = finding.references.length ? finding.references
    : finding.refTitle && finding.refUrl ? [{
      id: finding.id, title: finding.refTitle, source: finding.source,
      url: /^https?:\/\//.test(finding.refUrl) ? finding.refUrl : `https://${finding.refUrl}`,
    }] : [];
  return (
    <>
      <div className={styles.meta}>
        <Badge
          appearance="outline"
          color="informative"
          size="small"
          icon={finding.provenance === "ai-generated" ? <SparkleRegular /> : undefined}
        >
          {finding.provenance === "ai-generated" ? "AI generated"
            : finding.provenance === "deterministic" ? "Static" : "Unknown detection"}
        </Badge>
        <Badge appearance="tint" size="small" color={finding.sev === "warning" ? "warning" : STATUS_COLOR[finding.sev]}>
          {FINDING_STATUS_LABEL[finding.sev]} severity
        </Badge>
        {finding.dispositionLabel && (
          <Badge appearance="tint" size="small" color={finding.safetyDisposition === "advisory" ? "warning" : "danger"}>
            {finding.dispositionLabel}
          </Badge>
        )}
      </div>
      <dl className={styles.details}>
        {finding.how && <><dt><Caption1>Detection</Caption1></dt><dd><Caption1>{finding.how}</Caption1></dd></>}
        {finding.source && <><dt><Caption1>Reference source</Caption1></dt><dd><Caption1>{finding.source}</Caption1></dd></>}
        {finding.dimension && <><dt><Caption1>Rubric dimension</Caption1></dt><dd><Caption1>{finding.dimension}</Caption1></dd></>}
        {finding.safetyDisposition && <><dt><Caption1>Safety disposition</Caption1></dt><dd><Caption1>{finding.safetyDisposition}</Caption1></dd></>}
        {finding.platformOverlap && <><dt><Caption1>Platform overlap</Caption1></dt><dd><Caption1>{finding.platformOverlap}</Caption1></dd></>}
        {finding.skipAiEvaluation !== undefined && <>
          <dt><Caption1>AI evaluation skipped</Caption1></dt><dd><Caption1>{finding.skipAiEvaluation ? "Yes" : "No"}</Caption1></dd>
        </>}
      </dl>
      {finding.fact && <ResultField label="What we found"><pre className={styles.fact}>{finding.fact}</pre></ResultField>}
      {finding.why && <ResultField label="Why it matters">{finding.why}</ResultField>}
      {finding.fix && <ResultField label="Recommendation">{finding.fix}</ResultField>}
      {finding.fixSteps.length > 0 && (
        <ResultField label="How to fix">
          <ol className={styles.steps}>
            {finding.fixSteps.map((step, index) => (
              <li key={`${step.order}:${index}`} value={step.order}><Text className={styles.value}>{step.action}</Text></li>
            ))}
          </ol>
        </ResultField>
      )}
      {references.length > 0 && (
        <ResultField label={`References (${references.length})`}>
          <div className={styles.references}>
            {references.map((reference, index) => (
              <div className={styles.reference} key={`${reference.id}:${index}`}>
                <Badge appearance="outline" color="informative" size="small">{reference.source}</Badge>
                <Link className={styles.referenceLink} href={reference.url} target="_blank" rel="noreferrer">
                  <Text weight="semibold">{reference.title} <OpenRegular aria-hidden="true" /></Text>
                  <Caption1>{reference.url}</Caption1>
                </Link>
              </div>
            ))}
          </div>
        </ResultField>
      )}
      {(finding.sub || finding.componentIdUnique || finding.actionPath) && (
        <ResultField label="Saved attribution">
          <dl className={styles.details}>
            {finding.sub && <><dt><Caption1>Subject</Caption1></dt><dd><Text>{finding.sub}</Text></dd></>}
            {finding.componentIdUnique && <><dt><Caption1>Component ID</Caption1></dt><dd><Caption1>{finding.componentIdUnique}</Caption1></dd></>}
            {finding.actionPath && <><dt><Caption1>Action path</Caption1></dt><dd><Caption1>{finding.actionPath}</Caption1></dd></>}
          </dl>
        </ResultField>
      )}
      {finding.provenance === "ai-generated" && (
        <Caption1 className={styles.disclaimer}>AI-generated content may be incorrect.</Caption1>
      )}
    </>
  );
}

export function FindingsList({ rows, focusFindingId, accordion = false, label = "Review results" }: {
  rows: readonly ReviewResultRow[];
  focusFindingId?: string | null;
  accordion?: boolean;
  label?: string;
}) {
  const styles = useStyles();
  const drawerId = useId("finding-detail-");
  const cardsId = useId("finding-cards-");
  const closeButton = useRef<HTMLButtonElement>(null);
  const buttons = useRef(new Map<string, HTMLElement>());
  const [openKey, setOpenKey] = useState<string | null>(rows[0]?.key ?? null);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => resolveFindingRowFocus(findingRows(rows), focusFindingId) ?? null,
  );
  const [previousFocus, setPreviousFocus] = useState(focusFindingId);
  if (previousFocus !== focusFindingId) {
    setPreviousFocus(focusFindingId);
    const key = resolveFindingRowFocus(findingRows(rows), focusFindingId);
    if (key) {
      setSelectedKey(key);
      setOpenKey(key);
    }
  }

  const index = rows.findIndex((row) => row.key === selectedKey);
  const selected = index >= 0 ? rows[index] : null;
  const detailOpen = Boolean(selected);
  useEffect(() => {
    // Focus a control so a modal mounted during a tab change can activate.
    if (detailOpen) closeButton.current?.focus();
  }, [detailOpen]);
  const close = () => {
    const button = selectedKey ? buttons.current.get(selectedKey) : undefined;
    setSelectedKey(null);
    button?.focus();
  };

  return (
    <>
      {rows.length ? (
        <ul className={styles.list} aria-label={label}>
          {rows.map((row) => (
            <li key={row.key} className={accordion ? styles.card : undefined}>
              <button
                type="button"
                className={mergeClasses(styles.row, accordion && styles.cardHeader, !accordion && row.key === selectedKey && styles.selected)}
                ref={(element) => {
                  if (element) buttons.current.set(row.key, element);
                  else buttons.current.delete(row.key);
                }}
                aria-expanded={accordion ? row.key === openKey : row.key === selectedKey}
                aria-controls={accordion ? `${cardsId}-${row.key}` : row.key === selectedKey ? drawerId : undefined}
                aria-label={`${row.title} ${row.family} ${row.ruleId}${row.subject ? ` ${row.subject}` : ""} ${VERDICT_LABEL[row.status]} ${FINDING_STATUS_LABEL[row.status]}`}
                onClick={() => accordion ? setOpenKey(value => value === row.key ? null : row.key) : setSelectedKey(row.key)}
              >
                {accordion && <FindingSeverityIcon status={row.status} />}
                <span className={styles.main}>
                  <Text className={styles.title}>
                    {!accordion && row.finding?.provenance === "ai-generated" && (
                      <SparkleRegular aria-label="AI-generated finding" />
                    )} {row.title}
                  </Text>
                  {!accordion && <Badge appearance="outline" color="informative" size="small">{row.ruleId || row.family}</Badge>}
                </span>
                {accordion
                  ? row.key === openKey ? <ChevronUp20Regular aria-hidden="true" /> : <ChevronDown20Regular aria-hidden="true" />
                  : <ResultStatus status={row.status} />}
              </button>
              {accordion && row.key === openKey && (
                <div id={`${cardsId}-${row.key}`} className={styles.cardBody}>
                  {row.finding ? <>
                    {row.finding.fact && <Text className={styles.value}>{row.finding.fact}</Text>}
                    {row.finding.why && <Text className={styles.value}>{row.finding.why}</Text>}
                    {row.finding.fix && <div className={styles.recommendation}>
                      <Text weight="semibold">Recommendation.</Text>
                      <Text className={styles.value}>{row.finding.fix}</Text>
                    </div>}
                  </> : <Text>{FINDING_STATUS_HINT[row.status]}</Text>}
                  <Link as="button" className={styles.detailLink}
                    ref={element => { if (element) buttons.current.set(row.key, element); }}
                    onClick={() => setSelectedKey(row.key)}>More details</Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Text className={styles.empty} block>No review results match these filters.</Text>
      )}
      {selected && (
        <OverlayDrawer
          id={drawerId}
          open
          position="end"
          className={styles.drawer}
          onOpenChange={(_, detail) => { if (!detail.open) close(); }}
          aria-label="Finding details"
        >
          <DrawerHeader>
            <DrawerHeaderTitle action={(
              <Button ref={closeButton} appearance="subtle" icon={<Dismiss20Regular />} aria-label="Close finding details" onClick={close} />
            )}>
              <span className={styles.heading}>
                <Subtitle2 className={styles.title}>{selected.title}</Subtitle2>
                <ResultStatus status={selected.status} />
              </span>
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody className={styles.body}>
            <Caption1 className={styles.meta}>{selected.ruleId} · {selected.family}</Caption1>
            {selected.finding ? (
              <ResultFindingDetail finding={selected.finding} />
            ) : (
              <>
                <Text block>{FINDING_STATUS_HINT[selected.status]}</Text>
                {selected.subject && <Text block>Component: {selected.subject}</Text>}
              </>
            )}
            {rows.length > 1 && (
              <div className={styles.nav}>
                <Button appearance="subtle" icon={<ChevronLeft20Regular />} aria-label="Previous finding" disabledFocusable={index === 0} onClick={() => setSelectedKey(rows[index - 1].key)}>Prev</Button>
                <Text size={200} aria-live="polite">{index + 1} of {rows.length} results</Text>
                <Button appearance="subtle" icon={<ChevronRight20Regular />} iconPosition="after" aria-label="Next finding" disabledFocusable={index === rows.length - 1} onClick={() => setSelectedKey(rows[index + 1].key)}>Next</Button>
              </div>
            )}
          </DrawerBody>
        </OverlayDrawer>
      )}
    </>
  );
}
