/**
 * CSZipBotSelectorDialog
 *
 * Shown after a Copilot Studio solution ZIP is uploaded and contains
 * multiple Generative AI-enabled bots. Lets the user pick which bot to review.
 *
 * If the ZIP contains exactly one eligible bot, this dialog is skipped and
 * review starts immediately (handled by Dashboard).
 *
 * An agent with an unsupported harness shows "(Unsupported harness)" after its name.
 * When the user starts it, Dashboard shows the message, and no review runs (issue 947).
 */

import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Dropdown,
  Option,
  Image,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { BotSparkle20Regular, BotSparkle24Color, FolderZip20Regular } from '@fluentui/react-icons';
import { useState } from 'react';
import type { CSZipBot } from '../../declarative-agent/utils/csZipParser';
import { agentSelectorLabel } from '../../utils/agentHarness';

export interface CSZipBotSelectorDialogProps {
  open: boolean;
  /** Eligible standard GenerativeActionsEnabled, Microsoft Copilot, or unsupported harness agents from the parsed ZIP */
  bots: CSZipBot[];
  /** Original ZIP filename for display in the title */
  zipFileName: string;
  /** Called when user confirms selection and clicks Start Review */
  onStartReview: (bot: CSZipBot) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

const useStyles = makeStyles({
  surface: {
    width: '480px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  titleIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingTop: '4px',
  },
  label: {
    color: tokens.colorNeutralForeground2,
  },
  dropdown: {
    width: '100%',
  },
  startReviewButton: {
    whiteSpace: 'nowrap',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  optionIcon: {
    width: '20px',
    height: '20px',
    borderRadius: tokens.borderRadiusSmall,
    objectFit: 'cover',
    flexShrink: 0,
  },
  optionFallbackIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
});

export function CSZipBotSelectorDialog({
  open,
  bots,
  zipFileName,
  onStartReview,
  onCancel,
}: CSZipBotSelectorDialogProps) {
  const styles = useStyles();
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>('');

  const selectedBot = bots.find((b) => b.schemaName === selectedSchemaName) ?? null;

  const handleStartReview = () => {
    if (selectedBot) onStartReview(selectedBot);
  };

  // Reset selection when dialog opens
  const handleOpenChange = (_: unknown, data: { open: boolean }) => {
    if (!data.open) {
      onCancel();
    } else {
      setSelectedSchemaName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modalType="modal">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <div className={styles.titleRow}>
              <FolderZip20Regular className={styles.titleIcon} />
              <span>Select Agent to Review</span>
            </div>
          </DialogTitle>

          <DialogContent>
            <div className={styles.content}>
              <Text size={200} className={styles.label}>
                <strong>{zipFileName}</strong> contains {bots.length} Generative AI agent{bots.length !== 1 ? 's' : ''}. Select one to review:
              </Text>

              <Dropdown
                className={styles.dropdown}
                placeholder="Select an agent..."
                value={selectedBot ? agentSelectorLabel(selectedBot.name, selectedBot.harness) : ''}
                selectedOptions={selectedSchemaName ? [selectedSchemaName] : []}
                onOptionSelect={(_, data) => setSelectedSchemaName(data.optionValue ?? '')}
              >
                {bots.map((bot) => (
                  <Option key={bot.schemaName} value={bot.schemaName} text={agentSelectorLabel(bot.name, bot.harness)}>
                    <div className={styles.optionRow}>
                      {bot.iconBase64 ? (
                        <Image
                          src={`data:image/png;base64,${bot.iconBase64}`}
                          alt=""
                          className={styles.optionIcon}
                        />
                      ) : (
                        <BotSparkle20Regular className={styles.optionFallbackIcon} />
                      )}
                      {agentSelectorLabel(bot.name, bot.harness)}
                    </div>
                  </Option>
                ))}
              </Dropdown>

            </div>
          </DialogContent>

          <DialogActions position="end">
            <Button
              appearance="primary"
              icon={<BotSparkle24Color />}
              onClick={handleStartReview}
              disabled={!selectedBot}
              className={styles.startReviewButton}
            >
              Start Review
            </Button>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
