/**
 * DeclarativeEditForm — Step 2 of the declarative agent flow.
 *
 * Editable form for name, description, instructions, knowledge (SharePoint URLs),
 * capabilities (toggles), and starter prompts.
 *
 * Updated per Figma 1949:28580:
 * - Dynamic SharePoint URL list with add/delete/validation
 * - Starter prompt column headers (Title / Message) + per-row delete
 * - Back arrow in header, no back button in footer
 * - Knowledge section with description text
 *
 * Icon edit: clicking the icon in the Details section opens a "Change icon"
 * dialog where the user can upload a PNG (< 1 MB) to replace the template icon.
 *
 * All state is controlled by the parent.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  Spinner,
  Text,
  Textarea,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import type { InputOnChangeData, TextareaOnChangeData } from '@fluentui/react-components';
import {
  Add16Regular,
  ArrowLeft24Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Info16Regular,
} from '@fluentui/react-icons';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import iconSharePoint from '../assets/capability-sharepoint.svg';
import { CapabilityToggleRow } from './CapabilityToggleRow';
import { StarterPromptRow } from './StarterPromptRow';
import { KNOWN_CAPABILITIES } from '../constants/declarativeCapabilities';
import {
  validateSharePointUrl,
  SP_VALIDATION_ERROR_MESSAGE,
} from '../contracts/declarative-agent';
import type { DeclarativeEditFormState, ConversationStarter } from '../contracts/declarative-agent';
import type { AgentTemplate } from '../contracts/types';

export interface DeclarativeEditFormProps {
  template: AgentTemplate;
  hasSharePoint: boolean;
  formState: DeclarativeEditFormState;
  onFormChange: (updates: Partial<DeclarativeEditFormState>) => void;
  onBack: () => void;
  onDownloadClick: () => void;
  onDismiss: () => void;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    flexShrink: 0,
    paddingBottom: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginLeft: '-24px',
    marginRight: '-24px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  backButton: {
    minWidth: '24px',
    width: '24px',
    height: '24px',
    padding: 0,
  },
  titleText: {
    fontSize: '24px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '32px',
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1 1 0',
    minWidth: 0,
  },
  badge: {
    flexShrink: 0,
  },
  dismissButton: {
    flexShrink: 0,
  },
  scrollableBody: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '8px',
    marginRight: '-24px',
    paddingRight: '24px',
    '&::-webkit-scrollbar': {
      width: '6px',
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: '#F0F0F0',
      borderRadius: '10px',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#C4C4C4',
      borderRadius: '10px',
      border: '1px solid transparent',
      backgroundClip: 'content-box',
      maxHeight: '30px',
    },
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '16px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    height: '21px',
    position: 'relative',
  },
  sectionIcon: {
    position: 'absolute',
    left: '3px',
    top: '2px',
    width: '16px',
    height: '16px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    backgroundImage: 'linear-gradient(135deg, #6264A7 0%, #464EB8 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#6264A7',
  },
  sectionLabel: {
    position: 'absolute',
    left: '24px',
    top: '0',
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '21px',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  fullWidthInput: {
    width: '100%',
  },
  descriptionTextarea: {
    width: '100%',
    '& textarea': {
      minHeight: '96px',
    },
  },
  instructionsTextarea: {
    width: '100%',
    '& textarea': {
      minHeight: '180px',
      '&::-webkit-scrollbar': {
        width: '4px',
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
        borderRadius: '2px',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: '#3d3e78',
        borderRadius: '2px',
        minHeight: '111px',
      },
    },
  },
  // Details section — icon + name row
  detailsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
  },
  iconWrapper: {
    position: 'relative',
    flexShrink: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderRadius: '14px',
    lineHeight: 0,
    width: '48px',
    height: '48px',
  },
  customIconImage: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'block',
    objectFit: 'cover',
  },
  iconEditBadge: {
    position: 'absolute',
    bottom: '-6px',
    right: '-6px',
    zIndex: 2,
    width: '22px',
    height: '22px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1.5px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground1,
    fontSize: '12px',
    boxShadow: tokens.shadow4,
  },
  nameField: {
    flex: '1 0 0',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  fieldLabel: {
    paddingBottom: '6px',
  },
  // Change icon dialog
  iconDialogSurface: {
    maxWidth: '380px',
    width: '380px',
  },
  iconDialogContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    paddingTop: '16px',
    paddingBottom: '8px',
  },
  iconPreviewLarge: {
    width: '140px',
    height: '140px',
    borderRadius: '28px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  customIconPreviewImage: {
    width: '140px',
    height: '140px',
    display: 'block',
    objectFit: 'cover',
  },
  iconDialogInfoText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textAlign: 'left',
    width: '100%',
  },
  iconUploadError: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    width: '100%',
  },
  // SharePoint URL section
  spIcon: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
  },
  knowledgeDescription: {
    color: tokens.colorNeutralForeground2,
  },
  requiredAsterisk: {
    color: tokens.colorStatusDangerForeground3,
    paddingLeft: '2px',
  },
  spHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    paddingTop: '8px',
  },
  spUrlRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: '12px',
    alignItems: 'flex-start',
  },
  spUrlInput: {
    flex: 1,
  },
  addUrlButton: {
    alignSelf: 'flex-start',
  },
  // Starter prompts
  starterHeaderRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: '12px',
    paddingBottom: '4px',
  },
  starterHeaderTitle: {
    width: '199px',
    flexShrink: 0,
  },
  starterHeaderMessage: {
    flex: 1,
  },
  charCounter: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },
  charCounterExceeded: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    marginTop: '2px',
  },
  // Footer — sticky at bottom
  footer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: '16px',
    flexShrink: 0,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    marginLeft: '-24px',
    marginRight: '-24px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
});

const MAX_ICON_SIZE_BYTES = 1024 * 1024; // 1 MB
const MAX_NAME_LENGTH = 42;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_INSTRUCTIONS_LENGTH = 8000;

export const DeclarativeEditForm: React.FC<DeclarativeEditFormProps> = ({
  template,
  hasSharePoint,
  formState,
  onFormChange,
  onBack,
  onDownloadClick,
  onDismiss,
}) => {
  const styles = useStyles();

  // --- Change icon dialog state ---
  const [isIconDialogOpen, setIsIconDialogOpen] = useState(false);
  const [pendingIconDataUrl, setPendingIconDataUrl] = useState<string | null>(null);
  const [iconUploadError, setIconUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenIconDialog = () => {
    setPendingIconDataUrl(null);
    setIconUploadError(null);
    setIsIconDialogOpen(true);
  };

  const handleIconDialogClose = () => {
    setIsIconDialogOpen(false);
    setPendingIconDataUrl(null);
    setIconUploadError(null);
  };

  const handleChangeIconClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected if needed
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'image/png') {
      setIconUploadError('Only PNG files are supported.');
      return;
    }
    if (file.size >= MAX_ICON_SIZE_BYTES) {
      setIconUploadError('Image must be less than 1 MB.');
      return;
    }

    setIconUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingIconDataUrl((ev.target?.result as string) ?? null);
    };
    reader.readAsDataURL(file);
  };

  const handleIconSave = () => {
    if (pendingIconDataUrl !== null) {
      onFormChange({ iconDataUrl: pendingIconDataUrl });
    }
    setIsIconDialogOpen(false);
    setPendingIconDataUrl(null);
    setIconUploadError(null);
  };

  // The preview shown in the dialog: pending selection > previously saved > null
  const dialogPreviewUrl = pendingIconDataUrl ?? formState.iconDataUrl ?? null;

  // --- Name ---
  const handleNameChange = useCallback(
    (_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
      onFormChange({ name: data.value });
    },
    [onFormChange],
  );

  // --- Description ---
  const handleDescriptionChange = useCallback(
    (_ev: React.ChangeEvent<HTMLTextAreaElement>, data: TextareaOnChangeData) => {
      if (data.value.length <= MAX_DESCRIPTION_LENGTH) {
        onFormChange({ description: data.value });
      }
    },
    [onFormChange],
  );

  // --- Instructions ---
  const handleInstructionsChange = useCallback(
    (_ev: React.ChangeEvent<HTMLTextAreaElement>, data: TextareaOnChangeData) => {
      if (data.value.length <= MAX_INSTRUCTIONS_LENGTH) {
        onFormChange({ instructions: data.value });
      }
    },
    [onFormChange],
  );

  // --- Capabilities toggle ---
  const handleCapabilityChange = useCallback(
    (name: string, checked: boolean) => {
      onFormChange({
        capabilities: { ...formState.capabilities, [name]: checked },
      });
    },
    [formState.capabilities, onFormChange],
  );

  // --- SharePoint URL list ---
  const handleSpUrlChange = useCallback(
    (index: number, value: string) => {
      const updated = [...formState.sharePointUrls];
      updated[index] = value;
      onFormChange({ sharePointUrls: updated });
    },
    [formState.sharePointUrls, onFormChange],
  );

  const handleSpUrlDelete = useCallback(
    (index: number) => {
      if (formState.sharePointUrls.length <= 1) return; // keep at least one
      const updated = formState.sharePointUrls.filter((_, i) => i !== index);
      onFormChange({ sharePointUrls: updated });
    },
    [formState.sharePointUrls, onFormChange],
  );

  const handleAddUrl = useCallback(() => {
    onFormChange({ sharePointUrls: [...formState.sharePointUrls, ''] });
  }, [formState.sharePointUrls, onFormChange]);

  // --- Starter prompts ---
  const handleStarterTitleChange = useCallback(
    (index: number, value: string) => {
      const updated: ConversationStarter[] = formState.starters.map((s, i) =>
        i === index ? { ...s, title: value } : s,
      );
      onFormChange({ starters: updated });
    },
    [formState.starters, onFormChange],
  );

  const handleStarterTextChange = useCallback(
    (index: number, value: string) => {
      const updated: ConversationStarter[] = formState.starters.map((s, i) =>
        i === index ? { ...s, text: value } : s,
      );
      onFormChange({ starters: updated });
    },
    [formState.starters, onFormChange],
  );

  const handleStarterDelete = useCallback(
    (index: number) => {
      const updated = formState.starters.filter((_, i) => i !== index);
      onFormChange({ starters: updated });
    },
    [formState.starters, onFormChange],
  );

  /** Clear both title and text in a single state update (avoids stale-closure race) */
  const handleStarterClear = useCallback(
    (index: number) => {
      const updated: ConversationStarter[] = formState.starters.map((s, i) =>
        i === index ? { ...s, title: '', text: '' } : s,
      );
      onFormChange({ starters: updated });
    },
    [formState.starters, onFormChange],
  );

  // --- Create button disable logic ---
  const isDownloadDisabled = useMemo(() => {
    if (formState.isDownloading) return true;
    if (formState.name.trim() === '') return true;
    if (hasSharePoint) {
      // At least one valid URL required
      const hasOneValid = formState.sharePointUrls.some(
        (u) => u.trim() !== '' && validateSharePointUrl(u),
      );
      if (!hasOneValid) return true;
      // All non-empty URLs must be valid
      const allValid = formState.sharePointUrls.every(
        (u) => u.trim() === '' || validateSharePointUrl(u),
      );
      if (!allValid) return true;
    }
    // Starter prompts are optional — do not block Create
    return false;
  }, [formState.isDownloading, formState.name, formState.sharePointUrls, hasSharePoint]);

  return (
    <div className={styles.container}>
      {/* Header — fixed at top */}
      <div className={styles.headerRow}>
        <Button
          className={styles.backButton}
          appearance="subtle"
          size="small"
          icon={<ArrowLeft24Regular />}
          onClick={onBack}
          aria-label="Back"
        />
        {formState.iconDataUrl ? (
          <img
            src={formState.iconDataUrl}
            alt="Agent icon"
            className={styles.customIconImage}
          />
        ) : (
          <SquircleIcon
            iconGradient={template.iconGradient}
            iconSvg={template.iconSvg}
            iconName={template.icon}
            iconColor={template.iconColor}
            size={48}
          />
        )}
        <Text className={styles.titleText}>{formState.name}</Text>                                                                                                    
        <AgentTypeBadge />
        <Button
          className={styles.dismissButton}
          appearance="subtle"
          shape="circular"
          size="small"
          icon={<Dismiss20Regular />}
          onClick={onDismiss}
          aria-label="Close dialog"
        />
      </div>

      {/* Scrollable body */}
      <div className={styles.scrollableBody}>

      {/* Details section */}
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <Body1Strong>Details</Body1Strong>
        </div>

        {/* Icon + Name row */}
        <div className={styles.detailsRow}>
          <button
            className={styles.iconWrapper}
            onClick={handleOpenIconDialog}
            aria-label="Change agent icon"
          >
            {formState.iconDataUrl ? (
              <img
                src={formState.iconDataUrl}
                alt="Agent icon"
                className={styles.customIconImage}
              />
            ) : (
              <SquircleIcon
                iconGradient={template.iconGradient}
                iconSvg={template.iconSvg}
                iconName={template.icon}
                iconColor={template.iconColor}
                size={48}
              />
            )}
            <div className={styles.iconEditBadge} aria-hidden="true">
              <Edit20Regular />
            </div>
          </button>

          <div className={styles.nameField}>
            <Body1Strong className={styles.fieldLabel}>Name</Body1Strong>
            <Input
              className={styles.fullWidthInput}
              value={formState.name}
              onChange={handleNameChange}
              maxLength={MAX_NAME_LENGTH}
            />
          </div>
        </div>

        <div>
          <Body1Strong className={styles.fieldLabel}>Description
            <Tooltip content="Describe the purpose of this agent and when it should be used, so colleagues (and AI agents, if enabled) can use it effectively." relationship="description" withArrow>
              <Button appearance="subtle" size="small" icon={<Info16Regular />} aria-label="Description info" style={{ background: 'transparent', minWidth: 'auto' }} />
            </Tooltip>
          </Body1Strong>
          <Textarea
            className={styles.descriptionTextarea}
            resize="vertical"
            value={formState.description}
            onChange={handleDescriptionChange}
          />
          <Text
            className={
              formState.description.length >= MAX_DESCRIPTION_LENGTH
                ? styles.charCounterExceeded
                : styles.charCounter
            }
          >
            {formState.description.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>
        </div>
      </div>

      {/* Instructions */}
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <Body1Strong>Instructions</Body1Strong>
          <Tooltip content="Direct the behavior of the agent, including its tasks and how it completes them." relationship="description" withArrow>
            <Button appearance="subtle" size="small" icon={<Info16Regular />} aria-label="Instructions info" style={{ background: 'transparent', minWidth: 'auto' }} />
          </Tooltip>
        </div>
        <Textarea
          className={styles.instructionsTextarea}
          resize="vertical"
          value={formState.instructions}
          onChange={handleInstructionsChange}
        />
        <Text
          className={
            formState.instructions.length >= MAX_INSTRUCTIONS_LENGTH
              ? styles.charCounterExceeded
              : styles.charCounter
          }
        >
          {formState.instructions.length}/{MAX_INSTRUCTIONS_LENGTH}
        </Text>
      </div>

      {/* Knowledge (SharePoint) or Capabilities (Toggles) */}
      {hasSharePoint ? (
        <div className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <Body1Strong>Knowledge</Body1Strong>
            <Button appearance="subtle" size="small" icon={<Info16Regular />} aria-label="Knowledge info" style={{ background: 'transparent', minWidth: 'auto' }} />
          </div>
            <Body1 className={styles.knowledgeDescription}>
              Choose the sources your agent will use to generate responses
            </Body1>

            <div className={styles.spHeaderRow}>
              <img src={iconSharePoint} alt="" className={styles.spIcon} aria-hidden="true" />
              <Body1Strong>SharePoint Site URL<span className={styles.requiredAsterisk}>*</span></Body1Strong>
              <Tooltip
                content={<>Enter the full URL of a SharePoint site you have access to.{' '}<a href="https://learn.microsoft.com/microsoft-365/copilot/extensibility/agent-builder-add-knowledge#sharepoint-content" target="_blank" rel="noopener noreferrer">Learn more</a></>}
                relationship="description"
                withArrow
              >
                <Button appearance="subtle" size="small" icon={<Info16Regular />} aria-label="SharePoint URL info" style={{ background: 'transparent' }} />
              </Tooltip>
            </div>

            {formState.sharePointUrls.map((url, index) => {
              const trimmed = url.trim();
              const isInvalid = trimmed !== '' && !validateSharePointUrl(url);
              return (
                <div key={index} className={styles.spUrlRow}>
                  <Field
                    className={styles.spUrlInput}
                    validationState={isInvalid ? 'error' : undefined}
                    validationMessage={isInvalid ? SP_VALIDATION_ERROR_MESSAGE : undefined}
                  >
                    <Input
                      placeholder="SharePoint site URL (example: https://{tenant}.sharepoint.com/sites/{SiteName})..."
                      value={url}
                      onChange={(_ev, data) => handleSpUrlChange(index, data.value)}
                    />
                  </Field>
                  <Button
                    appearance="subtle"
                    size="medium"
                    icon={<Delete20Regular />}
                    onClick={() => handleSpUrlDelete(index)}
                    disabled={formState.sharePointUrls.length <= 1}
                    aria-label="Delete URL"
                  />
                </div>
              );
            })}

            <Button
              className={styles.addUrlButton}
              appearance="transparent"
              size="small"
              icon={<Add16Regular />}
              onClick={handleAddUrl}
              disabled={formState.sharePointUrls.length >= 10}
            >
              Add URL
            </Button>
          </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <Body1Strong>Capabilities</Body1Strong>
          </div>
          {Object.entries(formState.capabilities).map(([name, checked]) => (
            <CapabilityToggleRow
              key={name}
              capabilityName={name}
              displayName={KNOWN_CAPABILITIES.find((kc) => kc.name === name)?.displayName ?? name}
              checked={checked}
              onChange={handleCapabilityChange}
            />
          ))}
        </div>
      )}

      {/* Starter prompts */}
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <Body1Strong>Starter prompts</Body1Strong>
          <Tooltip content="Suggest ways of starting conversations." relationship="description" withArrow>
            <Button appearance="subtle" size="small" icon={<Info16Regular />} aria-label="Starter prompts info" style={{ background: 'transparent', minWidth: 'auto' }} />
          </Tooltip>
        </div>
          {formState.starters.length > 0 && (
            <div className={styles.starterHeaderRow}>
              <Text weight="semibold" className={styles.starterHeaderTitle}>Title</Text>
              <Text weight="semibold" className={styles.starterHeaderMessage}>Message</Text>
            </div>
          )}
          {formState.starters.map((starter, i) => (
            <StarterPromptRow
              key={i}
              index={i}
              title={starter.title}
              text={starter.text}
              onTitleChange={handleStarterTitleChange}
              onTextChange={handleStarterTextChange}
              onClear={handleStarterClear}
            />
          ))}
      </div>

      </div>{/* end scrollableBody */}

      {/* Footer — fixed at bottom */}
      <div className={styles.footer}>
        <Button
          appearance="primary"
          onClick={onDownloadClick}
          disabled={isDownloadDisabled}
        >
          {formState.isDownloading ? <Spinner size="tiny" /> : 'Download'}
        </Button>
      </div>

      {/* Change icon dialog */}
      {isIconDialogOpen && (
        <Dialog open onOpenChange={(_, data) => { if (!data.open) handleIconDialogClose(); }}>
          <DialogSurface className={styles.iconDialogSurface}>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    shape="circular"
                    size="small"
                    icon={<Dismiss20Regular />}
                    onClick={handleIconDialogClose}
                    aria-label="Close"
                  />
                }
              >
                Change icon
              </DialogTitle>
              <DialogContent>
                <div className={styles.iconDialogContent}>
                  {/* Icon preview */}
                  <div className={styles.iconPreviewLarge}>
                    {dialogPreviewUrl ? (
                      <img
                        src={dialogPreviewUrl}
                        alt="Icon preview"
                        className={styles.customIconPreviewImage}
                      />
                    ) : (
                      <SquircleIcon
                        iconGradient={template.iconGradient}
                        iconSvg={template.iconSvg}
                        iconName={template.icon}
                        iconColor={template.iconColor}
                        size={140}
                      />
                    )}
                  </div>

                  {/* File input (hidden) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  {/* Change icon button */}
                  <Button
                    appearance="outline"
                    icon={<Edit20Regular />}
                    onClick={handleChangeIconClick}
                  >
                    Change icon
                  </Button>

                  {iconUploadError && (
                    <Text className={styles.iconUploadError}>{iconUploadError}</Text>
                  )}

                  <Text className={styles.iconDialogInfoText}>
                    Upload a new icon for your agent. The icon must be in PNG format. Images
                    must be less than 1 MB.
                  </Text>
                </div>
              </DialogContent>
              <DialogActions>
                <Button
                  appearance="primary"
                  onClick={handleIconSave}
                  disabled={pendingIconDataUrl === null}
                >
                  Save
                </Button>
                <Button appearance="secondary" onClick={handleIconDialogClose}>
                  Cancel
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
};
