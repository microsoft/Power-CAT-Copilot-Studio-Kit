import {
  Body1,
  Body1Strong,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { EvaluationResultVM } from '../contracts/model-assessment';
import { presentAnalysis } from '../contracts/analysis-presentation';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  heading: { margin: 0 },
  paragraph: { margin: 0, lineHeight: tokens.lineHeightBase400 },
  findings: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    lineHeight: tokens.lineHeightBase400,
  },
});

interface AssessmentAnalysisProps {
  text: string;
  results: EvaluationResultVM[];
}

export function AssessmentAnalysis({ text, results }: AssessmentAnalysisProps) {
  const styles = useStyles();
  const analysis = presentAnalysis(text, results);

  if (analysis.sections) {
    return (
      <div className={styles.content}>
        {analysis.sections.map((section, index) => (
          <div key={index} className={styles.section}>
            {section.heading && (
              <Body1Strong as="h4" className={styles.heading}>
                {section.icon && <span aria-hidden="true">{`${section.icon} `}</span>}
                {section.heading}
              </Body1Strong>
            )}
            {section.items.length === 1 ? (
              <Body1 as="p" className={styles.paragraph}>{section.items[0]}</Body1>
            ) : (
              <ul className={styles.findings}>
                {section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.content}>
      <div className={styles.section}>
        <Body1Strong as="h4" className={styles.heading}>Summary</Body1Strong>
        <Body1 as="p" className={styles.paragraph}>{analysis.summary}</Body1>
      </div>
      {analysis.findings.length > 0 && (
        <div className={styles.section}>
          <Body1Strong as="h4" className={styles.heading}>Findings</Body1Strong>
          <ul className={styles.findings}>
            {analysis.findings.map((finding, index) => <li key={index}>{finding}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
