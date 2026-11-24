import { makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { Checkmark16Regular } from "@fluentui/react-icons";
import type { QuestionOptions } from "../../utils/question-options";

const useStyles = makeStyles({
  root: {
    marginTop: tokens.spacingVerticalS,
  },
  options: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalSNudge,
    padding: 0,
    margin: 0,
    listStyleType: "none",
  },
  option: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflowWrap: "anywhere",
  },
  selected: {
    ...shorthands.borderColor(tokens.colorBrandStroke2),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  icon: {
    flexShrink: 0,
  },
});

export function QuestionOptionsView({ question }: { question: QuestionOptions }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <ul className={styles.options} aria-label="Configured answer options"
        title="These options come from the current agent configuration and may differ from those shown during this conversation.">
        {question.options.map(option => {
          const selected = option.id === question.selectedId;
          return (
            <li key={option.id} className={mergeClasses(styles.option, selected && styles.selected)}
              aria-label={selected ? `${option.label} (recorded answer)` : undefined}
              title={selected ? "Recorded answer" : undefined}>
              {selected && <Checkmark16Regular className={styles.icon} aria-hidden="true" />}
              <span>{option.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
