import {
  makeStyles,
  tokens,
  Text,
  Card,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sectionHeading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  card: {
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
  qaRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    marginBottom: tokens.spacingVerticalXS,
  },
  qaQuestion: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
  qaAnswer: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalM,
  },
  justificationBlock: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    whiteSpace: 'pre-wrap',
  },
});

/** Details tab: Questionnaire Answers, Justification, Supporting Document */
export function ReviewDetailsTab() {
  const styles = useStyles();
  const { state } = useWizard();

  return (
    <>
      {/* ── Questionnaire Answers (hidden when no questionnaire configured) ─── */}
      {state.hasQuestionnaire !== false && (
        <Card className={styles.card}>
          <Accordion collapsible defaultOpenItems={[]}>
            <AccordionItem value="qa">
              <AccordionHeader size="large">
                <Text className={styles.sectionHeading} size={400}>
                  Questionnaire Answers ({state.answers.length})
                </Text>
              </AccordionHeader>
              <AccordionPanel>
                {state.answers.length === 0 ? (
                  <Text style={{ color: tokens.colorNeutralForeground3 }}>No answers.</Text>
                ) : (
                  state.answers.map((a) => (
                    <div key={a.questionId} className={styles.qaRow}>
                      <Text className={styles.qaQuestion}>
                        {a.questionText}
                      </Text>
                      <Text className={styles.qaAnswer}>
                        {a.answerType === 'MultiselectChoice'
                          ? (a.answerValue ? a.answerValue.split(',').map((v) => v.trim()).join(', ') : '-')
                          : a.answerType === 'Date'
                          ? (() => {
                              if (!a.answerValue) return '-';
                              const [y, mo, d] = a.answerValue.split('-').map(Number);
                              return new Date(y, mo - 1, d).toLocaleDateString();
                            })()
                          : a.answerValue === 'true' ? 'Yes'
                          : a.answerValue === 'false' ? 'No'
                          : a.answerValue || '-'}
                      </Text>
                    </div>
                  ))
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </Card>
      )}

      {/* ── Justification ─────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>Justification</Text>
          <div className={styles.justificationBlock}>
            <Text size={300}>{state.justification}</Text>
          </div>
        </div>
      </Card>

      {/* ── Supporting Document ────────────────────────────────────────────── */}
      {state.supportingDocument && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>Supporting Document</Text>
            <Text size={300}>{state.supportingDocument.name}</Text>
          </div>
        </Card>
      )}
    </>
  );
}
