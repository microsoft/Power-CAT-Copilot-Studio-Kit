import { Badge, Link, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import { DataUsage20Regular, Database20Regular, Sparkle20Regular } from "@fluentui/react-icons";
import type { UsageDiagnostics } from "../../contracts/diagnostics";
import { CREDIT_RATE_REFERENCE } from "../../utils/usage-insights";
import { SurfaceCard } from "../common/SurfaceCard";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalL, "@media (max-width: 760px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  body: { padding: tokens.spacingHorizontalL, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0 },
  total: { fontSize: tokens.fontSizeHero800, lineHeight: tokens.lineHeightHero800, fontWeight: tokens.fontWeightSemibold },
  stats: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingVerticalM },
  metric: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, minWidth: 0 },
  label: { color: tokens.colorNeutralForeground3 },
  row: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: tokens.spacingHorizontalM, paddingBottom: tokens.spacingVerticalM, borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  evidence: { display: "block", color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS },
  note: { color: tokens.colorNeutralForeground2, overflowWrap: "anywhere" },
});

const format = (value: number | undefined) => value === undefined
  ? "Not reported" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function UsageCreditsTab({ usage, scope }: { usage: UsageDiagnostics; scope: string }) {
  const styles = useStyles();
  const reported = usage.reported;
  return (
    <section className={styles.root} aria-label="Usage and credit diagnostics">
      <MessageBar intent="info"><MessageBarBody><strong>Diagnostic estimate, not a billing statement.</strong> Scope: {scope}. Missing metrics are not zero.</MessageBarBody></MessageBar>
      <div className={styles.grid}>
        <SurfaceCard title="Detected-event credit estimate" icon={<Sparkle20Regular />} actions={<Badge appearance="tint" color={usage.confidence === "none" ? "subtle" : "warning"}>{usage.confidence === "none" ? "No estimate" : `${usage.confidence === "low" ? "Low" : "Medium"} confidence`}</Badge>}>
          <div className={styles.body}>
            <Text className={styles.total}>{usage.estimatedCredits === undefined ? "Not available" : format(usage.estimatedCredits)}</Text>
            <Text size={200} className={styles.label}>Estimated Copilot Credits for the detected events only</Text>
            {usage.groups.length ? usage.groups.map((group) => (
              <div key={group.kind} className={styles.row}>
                <div><Text weight="semibold">{group.label}</Text><Text size={200} className={styles.evidence}>{group.evidence}</Text></div>
                <Text>{group.count} x {group.rate} = {format(group.credits)}</Text>
              </div>
            )) : <Text>No supported completed-event signals were found. No zero-credit assumption is made.</Text>}
            <Link href={CREDIT_RATE_REFERENCE} target="_blank" rel="noreferrer">Published rate reference</Link>
          </div>
        </SurfaceCard>
        <SurfaceCard title="Transcript-reported metrics" icon={<Database20Regular />} actions={<Badge appearance="tint" color={reported.source === "not-reported" ? "subtle" : "informative"}>{reported.source === "not-reported" ? "Not reported" : "Reported observations"}</Badge>}>
          <div className={styles.body}>
            <div className={styles.stats}>
              {[
                ["Copilot Credits", reported.copilotCredits], ["AI Builder credits", reported.aiBuilderCredits],
                ["Total tokens", reported.totalTokens], ["Prompt tokens", reported.promptTokens],
                ["Completion tokens", reported.completionTokens],
              ].map(([label, value]) => (
                <div className={styles.metric} key={label}>
                  <Text size={200} className={styles.label}>{label}</Text>
                  <Text weight="semibold">{format(typeof value === "number" ? value : undefined)}</Text>
                </div>
              ))}
              <div className={styles.metric}><Text size={200} className={styles.label}>Models reported</Text><Text weight="semibold">{reported.models.join(", ") || "Not reported"}</Text></div>
            </div>
            <Text size={200} className={styles.label}>
              Source: {reported.source === "activity-usage" ? "saved activity usage fields" : reported.source === "processed-token-observations" ? "parsed token observations" : "no usage fields in this transcript"}.
              {" "}{reported.tokenRecords} token {reported.tokenRecords === 1 ? "observation" : "observations"}; {reported.creditRecords} credit {reported.creditRecords === 1 ? "observation" : "observations"}.
              Copilot and AI Builder credits are not combined.
            </Text>
          </div>
        </SurfaceCard>
      </div>
      <SurfaceCard title="Limits and excluded meters" icon={<DataUsage20Regular />}>
        <div className={styles.body}>
          {usage.notes.slice(1).map((note) => <Text key={note} size={200} className={styles.note}>{note}</Text>)}
        </div>
      </SurfaceCard>
    </section>
  );
}
