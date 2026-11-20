import {
  makeStyles,
  tokens,
  Card,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';
import { ParticipantPicker } from '../../participants/components/ParticipantPicker';
import type { WizardParticipant } from '../contexts/wizardTypes';

const useStyles = makeStyles({
  card: {
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
});

/** Collaboration tab: Co-owner participant picker */
export function ReviewCollaborationTab() {
  const styles = useStyles();
  const { state, dispatch } = useWizard();

  function handleParticipantsChange(ps: WizardParticipant[]) {
    dispatch({ type: 'SET_PARTICIPANTS', payload: ps });
  }

  return (
    <Card className={styles.card}>
      <ParticipantPicker
        participants={state.participants}
        onChange={handleParticipantsChange}
      />
    </Card>
  );
}
