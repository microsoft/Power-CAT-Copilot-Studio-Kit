import type { ReactNode } from "react";
import {
  Caption1,
  Subtitle2,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  sectionTitle: {
    margin: 0,
  },
  fields: {
    display: "grid",
    gridTemplateColumns: "minmax(100px, 0.8fr) minmax(0, 1.2fr)",
    ...shorthands.gap(tokens.spacingVerticalS, tokens.spacingHorizontalS),
  },
  label: {
    color: tokens.colorNeutralForeground3,
  },
  value: {
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
});

/** Render label/value identity or evidence rows. */
export function AgentMapInspectorFields({
  rows,
}: {
  rows: Array<[string, string | undefined]>;
}) {
  const styles = useStyles();
  return (
    <div className={styles.fields}>
      {rows.filter(([, value]) => Boolean(value)).map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <Caption1 className={styles.label}>{label}</Caption1>
          <Text size={200} className={styles.value}>{value}</Text>
        </div>
      ))}
    </div>
  );
}

/** Render one named inspector section. */
export function AgentMapInspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      <Subtitle2 as="h4" className={styles.sectionTitle}>{title}</Subtitle2>
      {children}
    </section>
  );
}
