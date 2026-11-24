import { Link, Subtitle2, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowSwap20Regular, Open16Regular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';
import { modelDisplayName } from '../contracts/model-display';

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    margin: 0,
  },
  icon: { color: tokens.colorBrandForeground1 },
  text: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
  steps: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase300,
  },
  link: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

export interface ModelSwitchGuideProps {
  /** The model the latest assessment used. */
  assessedModel?: string;
  /** The agent's model in Copilot Studio, when it differs from the assessed one. */
  newModel?: string;
  studioUrl?: string;
  /** Model dropdown that saves the model to the agent; without it the manual steps are shown. */
  picker?: ReactNode;
  /** Button that assesses the agent after it is switched in Copilot Studio. */
  actionLabel?: string;
  /** The last assessment of the assessed model stopped before it finished; the action runs it again. */
  unfinished?: boolean;
}

/**
 * Explains how to switch the agent to another model: pick one from the list
 * (saved to the agent for you), or, when no list is available, change it in Copilot Studio.
 */
export function ModelSwitchGuide({ assessedModel, newModel, studioUrl, picker, actionLabel = 'Run', unfinished = false }: ModelSwitchGuideProps) {
  const styles = useStyles();
  const assessed = modelDisplayName(assessedModel) || 'the current model';
  const lastRun = unfinished
    ? <>The last assessment of <strong>{assessed}</strong> didn&apos;t finish. Select <strong>{actionLabel}</strong> to assess it again, or</>
    : <>This agent was last assessed on <strong>{assessed}</strong>.</>;
  const openLink = studioUrl && (
    <Link href={studioUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
      Open in Copilot Studio <Open16Regular aria-hidden />
    </Link>
  );

  if (newModel) {
    return (
      <div className={styles.card}>
        <Subtitle2 as="h3" className={styles.title}>
          <ArrowSwap20Regular className={styles.icon} />
          New model detected
        </Subtitle2>
        <span className={styles.text}>
          The agent now uses <strong>{modelDisplayName(newModel)}</strong> instead
          of <strong>{assessed}</strong>. Select <strong>Run</strong> to
          compare the two.
        </span>
        {picker}
      </div>
    );
  }

  if (picker) {
    return (
      <div className={styles.card}>
        <Subtitle2 as="h3" className={styles.title}>
          <ArrowSwap20Regular className={styles.icon} />
          Want to try a different model?
        </Subtitle2>
        <span className={styles.text}>
          {lastRun} {unfinished ? 'pick' : 'Pick'} another
          model and we&apos;ll save it to the agent, then compare how it performs.
        </span>
        {picker}
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <Subtitle2 as="h3" className={styles.title}>
        <ArrowSwap20Regular className={styles.icon} />
        Want to try a different model?
      </Subtitle2>
      <span className={styles.text}>
        {lastRun} {unfinished ? 'switch' : 'Switch'} it to
        another model in Copilot Studio and we&apos;ll compare how it performs.
      </span>
      <ol className={styles.steps}>
        <li>Open the agent in Copilot Studio.</li>
        <li>In <strong>Settings</strong>, choose the new model.</li>
        <li>Come back here and select <strong>{actionLabel}</strong>.</li>
      </ol>
      {openLink}
    </div>
  );
}
