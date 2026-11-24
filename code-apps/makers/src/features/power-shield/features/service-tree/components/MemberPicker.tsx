import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
} from '@fluentui/react-components';
import { AddRegular, DismissRegular } from '@fluentui/react-icons';
import { lookupUserByDomainName } from '../../../shared/services/dataverse/participantService';
import { useAuth } from '../../../shared/contexts/AuthContext';
import type { ServiceTreeMemberEntry } from '../../../models/serviceTreeMember';

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
  memberList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  memberRow: {
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
  memberInfo: {
    flex: '1',
  },
  ownerBadge: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  requirementHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic' as const,
  },
  requiredStar: {
    color: tokens.colorStatusDangerForeground1,
  },
});

interface MemberPickerProps {
  /** Currently added members (not including the locked creator row). */
  members: ServiceTreeMemberEntry[];
  onChange: (members: ServiceTreeMemberEntry[]) => void;
  /**
   * UPNs that are already members and cannot be added or removed
   * (e.g. the creator). Shown as locked rows above the editable list.
   */
  lockedMembers?: ServiceTreeMemberEntry[];
}

export function MemberPicker({ members, onChange, lockedMembers = [] }: MemberPickerProps) {
  const styles = useStyles();
  const auth = useAuth();

  const [username, setUsername] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extract domain from current user's UPN for auto-completion
  const userDomain = auth.upn.includes('@') ? auth.upn.substring(auth.upn.indexOf('@')) : '';

  const allUPNs = [
    ...lockedMembers.map((m) => m.upn.toLowerCase()),
    ...members.map((m) => m.upn.toLowerCase()),
  ];
  const allAADIds = [
    ...lockedMembers.map((m) => m.aadObjectId),
    ...members.map((m) => m.aadObjectId),
  ];

  async function handleAdd() {
    let trimmed = username.trim();

    if (!trimmed) {
      setErrorMessage('Please enter an email address.');
      return;
    }

    // Auto-append domain if user typed just the alias (no @)
    if (!trimmed.includes('@') && userDomain) {
      trimmed = trimmed + userDomain;
    }

    if (trimmed.toLowerCase() === auth.upn.toLowerCase()) {
      setErrorMessage('You cannot add yourself as a member.');
      return;
    }

    if (allUPNs.includes(trimmed.toLowerCase())) {
      setErrorMessage('User already added.');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
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

      if (allAADIds.includes(user.aadObjectId)) {
        setErrorMessage('User already added.');
        return;
      }

      const entry: ServiceTreeMemberEntry = {
        dvUserId: user.dvUserId,
        aadObjectId: user.aadObjectId,
        upn: user.upn,
        displayName: user.displayName,
      };
      onChange([...members, entry]);
      setUsername('');
      setErrorMessage(null);
    } catch {
      setErrorMessage('Lookup failed. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }

  function removeMember(aadObjectId: string) {
    onChange(members.filter((m) => m.aadObjectId !== aadObjectId));
  }

  const allDisplayed = [...lockedMembers, ...members];

  return (
    <div className={styles.root}>
      <Text weight="semibold">
        Team Members <span className={styles.requiredStar} aria-hidden="true">*</span>
      </Text>
      <Text className={styles.requirementHint}>
        Add at least one team member besides yourself. They&apos;ll be able to create requests for this Service Tree.
      </Text>

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

      {allDisplayed.length > 0 && (
        <div className={styles.memberList}>
          {allDisplayed.map((m) => {
            const isLocked = lockedMembers.some((lm) => lm.aadObjectId === m.aadObjectId);
            return (
              <div key={m.aadObjectId} className={styles.memberRow}>
                <div className={styles.memberInfo}>
                  <Text>
                    {m.displayName}
                    {isLocked && (
                      <Text className={styles.ownerBadge}>{' '}(Owner)</Text>
                    )}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>
                    {m.upn}
                  </Text>
                </div>
                {!isLocked && (
                  <Button
                    appearance="transparent"
                    icon={<DismissRegular />}
                    onClick={() => removeMember(m.aadObjectId)}
                    aria-label={`Remove ${m.displayName}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
