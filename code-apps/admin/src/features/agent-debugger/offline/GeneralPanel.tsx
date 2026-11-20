import { Body1, Subtitle2, makeStyles, tokens } from "@fluentui/react-components";
import type { OfflineConversationSnapshot } from "../contracts/offline-viewer";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXL },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  fields: {
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
    columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalM,
    margin: 0, padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    "& dt": { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
    "& dd": { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
    "@media (max-width: 479px)": { gridTemplateColumns: "minmax(0, 1fr)", rowGap: tokens.spacingVerticalS },
  },
});

/** Renders captured summary/session values without deriving new metrics or fetching data. */
export function GeneralPanel({ sections }: { sections: OfflineConversationSnapshot["generalSections"] }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      {!sections?.length ? <Body1 as="p">General details were not captured.</Body1> : sections.map((section, index) => (
        <section key={index} className={styles.section} aria-labelledby={`general-heading-${index}`}>
          <Subtitle2 as="h2" id={`general-heading-${index}`}>{section.heading}</Subtitle2>
          {section.blocks.map((block, blockIndex) => {
            if (block.kind === "fields") return (
              <dl key={blockIndex} className={styles.fields}>
                {block.fields.map((field, fieldIndex) => (
                  <div key={fieldIndex} style={{ display: "contents" }}>
                    <dt>{field.label}</dt><dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            );
            if (block.kind === "heading") return <Subtitle2 as="h3" key={blockIndex}>{block.text}</Subtitle2>;
            if (block.kind === "text") return <Body1 as="p" key={blockIndex}>{block.text}</Body1>;
            return null;
          })}
        </section>
      ))}
    </div>
  );
}
