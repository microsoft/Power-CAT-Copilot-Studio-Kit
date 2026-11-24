import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import { AddRegular, DismissRegular, Info16Regular } from '@fluentui/react-icons';
import { lookupUserByDomainName } from '../../../shared/services/dataverse/participantService';
import { useAuth } from '../../../shared/contexts/AuthContext';
import type { WizardParticipant } from '../../wizard/contexts/wizardTypes';

const MAX_PARTICIPANTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  addRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-start',
  },
  participantList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  participantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
  },
  participantName: {
    flex: '1',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

interface ParticipantPickerProps {
  participants: WizardParticipant[];
  onChange: (participants: WizardParticipant[]) => void;
}

export function ParticipantPicker({ participants, onChange }: ParticipantPickerProps) {
  const styles = useStyles();
  const auth = useAuth();

  const [username, setUsername] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extract domain from current user's UPN for auto-completion
  const userDomain = auth.upn.includes('@') ? auth.upn.substring(auth.upn.indexOf('@')) : '';

  async function handleAdd() {
    let trimmed = username.trim();

    if (!trimmed) {
      console.log('[ParticipantPicker] Validation: empty input');
      setErrorMessage('Please enter an email address.');
      return;
    }

    // Auto-append domain if user typed just the alias (no @)
    if (!trimmed.includes('@') && userDomain) {
      trimmed = trimmed + userDomain;
    }

    if (trimmed.toLowerCase() === auth.upn.toLowerCase()) {
      setErrorMessage('You cannot add yourself as a co-owner.');
      return;
    }

    if (participants.some((p) => p.upn.toLowerCase() === trimmed.toLowerCase())) {
      console.log('[ParticipantPicker] Validation: duplicate (by upn)');
      setErrorMessage('User already added.');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
      console.log('[ParticipantPicker] Validation: invalid email format');
      setErrorMessage('Please enter a valid email address (e.g. user@domain.com).');
      return;
    }

    setIsAdding(true);
    setErrorMessage(null);
    try {
      const user = await lookupUserByDomainName(trimmed);
      if (!user) {
        setErrorMessage(`No user found with username "${trimmed}".`);
        return;
      }

      if (participants.some((p) => p.aadObjectId === user.aadObjectId)) {
        console.log('[ParticipantPicker] Validation: duplicate (by aadObjectId)');
        setErrorMessage('User already added.');
        return;
      }

      const participant: WizardParticipant = {
        dvUserId: user.dvUserId,
        aadObjectId: user.aadObjectId,
        upn: user.upn,
        displayName: user.displayName,
        role: 'Participant',
      };
      onChange([...participants, participant]);
      setUsername('');
      setErrorMessage(null);
    } catch (err) {
      console.error('[ParticipantPicker] Lookup failed:', err);
      setErrorMessage('Lookup failed. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }

  function removeParticipant(aadObjectId: string) {
    onChange(participants.filter((p) => p.aadObjectId !== aadObjectId));
  }

  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <Text weight="semibold">Co-owner(s)</Text>
        <Tooltip
          content="Co-owners receive read and write access to this policy request, allowing them to view details, post comments, and collaborate on the request."
          relationship="description"
        >
          <Info16Regular style={{ color: tokens.colorNeutralForeground3, cursor: 'help' }} />
        </Tooltip>
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Add co-owners who can view, comment on, and collaborate on this request (max {MAX_PARTICIPANTS}).
      </Text>

      {participants.length < MAX_PARTICIPANTS && (
        <div>
          <div className={styles.addRow}>
            <Input
              value={username}
              onChange={(_, data) => {
                setUsername(data.value);
                setErrorMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleAdd();
                }
              }}
              placeholder={userDomain ? `Enter alias or full email (e.g. john or john${userDomain})` : 'Enter email address (e.g. user@domain.com)'}
              style={{ minWidth: '350px' }}
              disabled={isAdding}
            />
            <Button
              appearance="primary"
              icon={isAdding ? <Spinner size="tiny" /> : <AddRegular />}
              onClick={() => void handleAdd()}
              disabled={isAdding}
            >
              Add
            </Button>
          </div>

          {errorMessage && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, marginTop: tokens.spacingVerticalXS }}>
              {errorMessage}
            </Text>
          )}
        </div>
      )}

      {participants.length > 0 && (
        <div className={styles.participantList}>
          {participants.map((p) => (
            <div key={p.aadObjectId} className={styles.participantRow}>
              <div className={styles.participantName}>
                <Text>{p.displayName}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>
                  {p.upn}
                </Text>
              </div>
              <Button
                appearance="transparent"
                icon={<DismissRegular />}
                onClick={() => removeParticipant(p.aadObjectId)}
                aria-label={`Remove ${p.displayName}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
