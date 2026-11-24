/**
 * NewTemplateDialog — admin-only template authoring modal (UI only).
 *
 * Serves both "New Template" (create) and "Edit Template" (edit) flows via the
 * `mode` prop — the form layout is shared, only header, the package section,
 * and the primary button label differ. Pure presentation: no backend wiring —
 * the primary action and Cancel both simply close the dialog. State is local
 * and exists only to make the form interactive.
 *
 * Mirrors the static mocks at
 *   Custom Agent Templates Mock/html/new-template.html
 *   Custom Agent Templates Mock/html/edit-template.html
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  Label,
  Input,
  Textarea,
  Button,
  Switch,
  Tooltip,
  Link,
  Spinner,
  MessageBar,
  MessageBarBody,
  mergeClasses,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Edit20Regular,
  Dismiss20Regular,
  Document20Regular,
  ArrowUpload20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import { ICON_GRADIENTS } from '../data/agentTemplateCatalog';
import { ICON_MAP } from '../utils/iconMap';
import {
  ACCENT_SWATCHES,
  TEMPLATE_ICON_CHOICES,
  TEMPLATE_ICON_LABELS,
  DEFAULT_ICON,
} from '../utils/templateAuthoring';
import type { TemplateSubmitValues } from '../contracts/types';
import { detectAgentTypeFromZip } from '../utils/detectAgentType';
import { AgentTypeBadge } from './AgentTypeBadge';

/** Maximum solution package size (matches the dropzone hint copy). */
const MAX_ZIP_BYTES = 30 * 1024 * 1024;

/** Shown when an uploaded ZIP isn't a recognised custom/declarative package. */
const UNSUPPORTED_ATTACHMENT_MESSAGE =
  'Unsupported attachment. Upload a Copilot Studio solution or a declarative agent package (.zip).';

/**
 * Regex URL validation for the optional resource links. Requires an absolute
 * http(s) URL with a dotted domain (e.g. https://aka.ms/foo). An empty value is
 * valid since the field is optional.
 */
const URL_REGEX =
  /^https?:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/;

function isValidOptionalUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return URL_REGEX.test(trimmed);
}

// ---------------------------------------------------------------------------
// Static option data
// ---------------------------------------------------------------------------

/**
 * Agent type is persisted on the template (table field) but no longer chosen in
 * the dialog — it is fixed to 'custom' for now and will become dynamic later.
 */
type AgentTypeChoice = 'custom' | 'declarative' | 'unknown';
type PublishStatus = 'active' | 'inactive';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  surface: {
    borderRadius: tokens.borderRadiusXLarge,
    maxWidth: '720px',
    width: '720px',
    maxHeight: '90vh',
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    overflow: 'hidden',
    height: '100%',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  headerIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundImage: ICON_GRADIENTS.cerulean,
    flexShrink: 0,
  },
  headerIconEdit: {
    backgroundImage: ICON_GRADIENTS.fern,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: '1 1 0',
    minWidth: 0,
  },
  headerTitle: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase500,
    color: tokens.colorNeutralForeground1,
    margin: 0,
  },
  headerSub: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
  },
  // Right side of the header — agent-type chip kept close to the close button
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  dismissBtn: {
    flexShrink: 0,
  },

  // Scroll region
  scroll: {
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
  },

  // Sections
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  sectionTitleNormal: {
    textTransform: 'none',
    fontWeight: tokens.fontWeightRegular,
    letterSpacing: 'normal',
    color: tokens.colorNeutralForeground3,
  },

  // Fields
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },

  // Publish-status switch — keep it intrinsic width so it isn't stretched by the
  // column's `align-items: stretch` (which would offset the clickable input from
  // the visible toggle), and vertically centre the label against the toggle.
  publishSwitch: {
    alignSelf: 'flex-start',
    alignItems: 'center',    
  },
  publishSwitchLabel: {
    paddingLeft:  0,
  },
  required: {
    color: tokens.colorPaletteRedForeground1,
    marginLeft: '2px',
  },

  // Icon & Color — large preview on the left, colour + icon rows stacked right
  iconColor: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
  },
  iconColorPreview: {
    width: '80px',
    height: '80px',
    borderRadius: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    flexShrink: 0,
  },
  iconColorRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    flex: '1 1 auto',
    minWidth: 0,
  },
  swatches: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  // Colour tiles — same button as the icon options (which fill cleanly), but
  // circular: the gradient is the background, no icon inside.
  swatch: {
    appearance: 'none',
    width: '36px',
    height: '36px',
    minWidth: '36px',
    boxSizing: 'border-box',
    flexShrink: 0,
    borderRadius: '50%',
    cursor: 'pointer',
    padding: 0,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  swatchSelected: {
    outline: `2px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '1px',
  },

  // Dropzone
  dropzone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'dashed',
    borderRightStyle: 'dashed',
    borderBottomStyle: 'dashed',
    borderLeftStyle: 'dashed',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: 'center',
  },
  dropzoneIcon: {
    fontSize: '24px',
    color: tokens.colorNeutralForeground3,
  },
  dropzonePrimary: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
  dropzoneHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },

  // Has-file row (edit mode "Replace Template File")
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: tokens.colorPaletteGreenBorder1,
    borderRightColor: tokens.colorPaletteGreenBorder1,
    borderBottomColor: tokens.colorPaletteGreenBorder1,
    borderLeftColor: tokens.colorPaletteGreenBorder1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
  fileIcon: {
    fontSize: '20px',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  fileName: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
  // Edit mode with a delete action: push delete to the left, Cancel/Save right.
  footerSpread: {
    justifyContent: 'space-between',
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  // Destructive outline button (red text + border) per the edit-template mock.
  // Griffel forbids the `borderColor` shorthand — set the four longhands.
  deleteButton: {
    color: tokens.colorPaletteRedForeground1,
    borderTopColor: tokens.colorPaletteRedBorder1,
    borderRightColor: tokens.colorPaletteRedBorder1,
    borderBottomColor: tokens.colorPaletteRedBorder1,
    borderLeftColor: tokens.colorPaletteRedBorder1,
    ':hover': {
      color: tokens.colorPaletteRedForeground1,
      backgroundColor: tokens.colorPaletteRedBackground1,
      borderTopColor: tokens.colorPaletteRedBorder1,
      borderRightColor: tokens.colorPaletteRedBorder1,
      borderBottomColor: tokens.colorPaletteRedBorder1,
      borderLeftColor: tokens.colorPaletteRedBorder1,
    },
    ':hover:active': {
      color: tokens.colorPaletteRedForeground1,
      borderTopColor: tokens.colorPaletteRedBorder1,
      borderRightColor: tokens.colorPaletteRedBorder1,
      borderBottomColor: tokens.colorPaletteRedBorder1,
      borderLeftColor: tokens.colorPaletteRedBorder1,
    },
  },

  // Delete confirmation modal
  confirmSurface: {
    maxWidth: '420px',
    padding: '0',
  },
  confirmBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
  },
  confirmTitle: {
    margin: '0',
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase500,
    color: tokens.colorNeutralForeground1,
  },
  confirmText: {
    margin: '0',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground2,
  },
  confirmActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  // Red filled confirm button (destructive primary action).
  confirmDeleteButton: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    borderTopColor: tokens.colorPaletteRedBackground3,
    borderRightColor: tokens.colorPaletteRedBackground3,
    borderBottomColor: tokens.colorPaletteRedBackground3,
    borderLeftColor: tokens.colorPaletteRedBackground3,
    ':hover': {
      backgroundColor: tokens.colorPaletteRedForeground1,
      borderTopColor: tokens.colorPaletteRedForeground1,
      borderRightColor: tokens.colorPaletteRedForeground1,
      borderBottomColor: tokens.colorPaletteRedForeground1,
      borderLeftColor: tokens.colorPaletteRedForeground1,
    },
    ':hover:active': {
      backgroundColor: tokens.colorPaletteRedForeground1,
      borderTopColor: tokens.colorPaletteRedForeground1,
      borderRightColor: tokens.colorPaletteRedForeground1,
      borderBottomColor: tokens.colorPaletteRedForeground1,
      borderLeftColor: tokens.colorPaletteRedForeground1,
    },
  },

  // Icon picker (replaces the static "Change icon…" affordance)
  iconPicker: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  iconOption: {
    width: '36px',
    height: '36px',
    minWidth: '36px',
    boxSizing: 'border-box',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    padding: 0,
  },
  iconOptionSelected: {
    color: tokens.colorNeutralForegroundOnBrand,
    borderTopColor: tokens.colorBrandStroke1,
    borderRightColor: tokens.colorBrandStroke1,
    borderBottomColor: tokens.colorBrandStroke1,
    borderLeftColor: tokens.colorBrandStroke1,
  },

  // Selected-file row (create mode, after a file is chosen)
  fileError: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
  },
  hiddenInput: {
    display: 'none',
  },
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Initial values to prefill the form when editing an existing template. */
export interface TemplateFormValues {
  name?: string;
  description?: string;
  agentType?: AgentTypeChoice;
  publishStatus?: PublishStatus;
  accent?: string;
  /** Fluent icon key (ICON_MAP) for the squircle glyph. */
  icon?: string;
  /** Name of the currently-attached package file (edit mode). */
  fileName?: string;
  learnMoreUrl?: string;
  setupGuideUrl?: string;
  /** Source badge shown in the edit header (e.g. "Custom"). */
  source?: string;
}

interface NewTemplateDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close (Cancel, X, or backdrop). */
  onClose: () => void;
  /** 'create' (default) renders New Template; 'edit' renders Edit Template. */
  mode?: 'create' | 'edit';
  /** Prefilled values — used in edit mode. */
  initialValues?: TemplateFormValues;
  /**
   * Persist the form. The host wires this to its create/update callback. The
   * dialog awaits it, surfaces any rejection inline, and closes only on success.
   * When omitted the primary button just closes (legacy UI-only behaviour).
   * On create `file` is always present; on edit it is undefined when the ZIP
   * was not replaced.
   */
  onSubmit?: (values: TemplateSubmitValues, file?: File) => Promise<void>;
  /**
   * Permanently delete the template being edited (edit mode only). When
   * provided, a "Delete template" button is shown in the footer that opens a
   * confirmation modal before invoking this callback. The dialog awaits it and
   * closes only on success; a rejection is surfaced inline and the dialog stays
   * open. Omit to hide the delete affordance.
   */
  onDelete?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NewTemplateDialog: React.FC<NewTemplateDialogProps> = ({
  open,
  onClose,
  mode = 'create',
  initialValues,
  onSubmit,
  onDelete,
}) => {
  const styles = useStyles();
  const isEdit = mode === 'edit';

  // Controlled form state.
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [description, setDescription] = useState<string>(initialValues?.description ?? '');
  // Agent type isn't picked manually — it's seeded from the existing value and
  // re-derived from the uploaded package on file select (see acceptFile). Drives
  // the header badge and is persisted on the template.
  const [agentType, setAgentType] = useState<AgentTypeChoice>(
    initialValues?.agentType ?? 'custom',
  );
  const [publishStatus, setPublishStatus] = useState<PublishStatus>(
    initialValues?.publishStatus ?? 'active',
  );
  const [accent, setAccent] = useState<string>(
    initialValues?.accent ?? ACCENT_SWATCHES[0].key,
  );
  const [icon, setIcon] = useState<string>(initialValues?.icon || DEFAULT_ICON);
  const [learnMoreUrl, setLearnMoreUrl] = useState<string>(initialValues?.learnMoreUrl ?? '');
  const [setupGuideUrl, setSetupGuideUrl] = useState<string>(initialValues?.setupGuideUrl ?? '');

  // File selection (the solution ZIP travels separately from the form values).
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit lifecycle.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Delete lifecycle (edit mode only — gated on the `onDelete` prop).
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset the form every time the dialog opens so stale values from a previous
  // session don't linger: create starts blank, edit (re)seeds from the selected
  // template. The dialog stays mounted (only `open` toggles), so the useState
  // initializers above don't re-run on reopen — this effect handles it.
  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? '');
    setDescription(initialValues?.description ?? '');
    setAgentType(initialValues?.agentType ?? 'unknown');
    setPublishStatus(initialValues?.publishStatus ?? 'active');
    setAccent(initialValues?.accent ?? ACCENT_SWATCHES[0].key);
    setIcon(initialValues?.icon || DEFAULT_ICON);
    setLearnMoreUrl(initialValues?.learnMoreUrl ?? '');
    setSetupGuideUrl(initialValues?.setupGuideUrl ?? '');
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setSubmitting(false);
    setShowErrors(false);
    setConfirmDeleteOpen(false);
    setDeleting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Re-seed only on the open transition; `initialValues` is stable per open
    // (create: undefined; edit: keyed remount), so it is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedGradient =
    ACCENT_SWATCHES.find((s) => s.key === accent)?.gradient ?? ICON_GRADIENTS.cerulean;
  const SelectedGlyph = ICON_MAP[icon];

  // Required-field validity (file required only on create).
  const nameMissing = !name.trim();
  const descriptionMissing = !description.trim();
  const fileMissing = !isEdit && !file;
  // Optional resource links — must be valid http(s) URLs when provided.
  const learnMoreUrlInvalid = !isValidOptionalUrl(learnMoreUrl);
  const setupGuideUrlInvalid = !isValidOptionalUrl(setupGuideUrl);

  // Whole-form validity — drives the Save/Create button so it is enabled only
  // when every value is correct and there are no outstanding errors.
  const hasErrors =
    nameMissing ||
    descriptionMissing ||
    fileMissing ||
    agentType === 'unknown' ||
    learnMoreUrlInvalid ||
    setupGuideUrlInvalid ||
    !!fileError;

  const pickFile = () => fileInputRef.current?.click();

  /**
   * Validate a chosen ZIP, accept it, and derive the agent type from its
   * contents. Detection runs async; the badge + persisted `agentType` update
   * once it resolves, falling back to 'custom' when the package has no
   * recognisable marker or can't be read.
   */
  // Reject an attachment whose contents don't resolve to a supported package
  // type. On edit we revert to the existing template's type (the original file
  // remains); on create there's no valid attachment yet.
  const handleUnsupportedAttachment = () => {
    setFile(null);
    setAgentType(isEdit ? (initialValues?.agentType === 'declarative' ? 'declarative' : 'custom') : 'unknown');
    setFileError(UNSUPPORTED_ATTACHMENT_MESSAGE);
  };

  const acceptFile = (picked: File) => {
    if (!picked.name.toLowerCase().endsWith('.zip')) {
      setFileError('Please choose a .zip solution package.');
      return;
    }
    if (picked.size > MAX_ZIP_BYTES) {
      setFileError('File exceeds the 30 MB limit.');
      return;
    }
    setFileError(null);
    setFile(picked);
    void detectAgentTypeFromZip(picked)
      .then((detected) => {
        // Only Copilot Studio solutions and declarative packages are supported;
        // anything else (incl. 'unknown') is rejected with an error.
        if (detected !== 'custom' && detected !== 'declarative') {
          handleUnsupportedAttachment();
          return;
        }
        setAgentType(detected);
      })
      .catch(handleUnsupportedAttachment);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-selecting the same file
    if (!picked) return;
    acceptFile(picked);
  };

  const handleSubmit = async () => {
    // Legacy UI-only behaviour when no persistence callback is supplied.
    if (!onSubmit) {
      onClose();
      return;
    }
    if (
      nameMissing ||
      descriptionMissing ||
      fileMissing ||
      agentType === 'unknown' ||
      learnMoreUrlInvalid ||
      setupGuideUrlInvalid
    ) {
      setShowErrors(true);
      return;
    }
    const values: TemplateSubmitValues = {
      name: name.trim(),
      description: description.trim(),
      agentType,
      publishStatus,
      icon,
      accent,
      // Send the trimmed value (empty string when blank) rather than undefined,
      // so clearing an existing URL on edit is persisted instead of treated as
      // "no change". These are optional fields and may legitimately be blank.
      learnMoreUrl: learnMoreUrl.trim(),
      setupGuideUrl: setupGuideUrl.trim(),
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values, file ?? undefined);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save the template.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Confirmed delete. Invokes the host `onDelete`, closes the dialog on success,
   * and surfaces any rejection inline (the confirm modal closes so the error is
   * visible on the edit form).
   */
  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setSubmitError(null);
    try {
      await onDelete();
      setConfirmDeleteOpen(false);
      onClose();
    } catch (err) {
      setConfirmDeleteOpen(false);
      setSubmitError(err instanceof Error ? err.message : 'Failed to delete the template.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open && !submitting) onClose(); }}>
      <DialogSurface className={styles.surface} aria-labelledby="new-template-title">
        <DialogBody className={styles.body}>
          {/* Header */}
          <div className={styles.header}>
            <span
              className={mergeClasses(styles.headerIcon, isEdit && styles.headerIconEdit)}
              aria-hidden="true"
            >
              {isEdit ? <Edit20Regular /> : <Add20Regular />}
            </span>
            <div className={styles.headerText}>
              <h2 id="new-template-title" className={styles.headerTitle}>
                {isEdit ? 'Edit Template' : 'New Template'}
              </h2>
              <span className={styles.headerSub}>
                {isEdit
                  ? (initialValues?.name ?? 'Template')
                  : 'Publish a custom agent template to the Agent Library.'}
              </span>
            </div>
            <div className={styles.headerRight}>
              {/*
                Agent type is derived from the uploaded package (custom vs
                declarative) and reflected here. The badge shows once an
                attachment exists — always in edit mode (a package is already
                attached), and in create mode once a file is selected.
              */}
              {(isEdit || file) && (
                <AgentTypeBadge
                  label={agentType === 'declarative' ? 'Declarative Agent' : 'Custom Agent'}
                />
              )}
              <Button
                className={styles.dismissBtn}
                appearance="subtle"
                icon={<Dismiss20Regular />}
                aria-label="Close"
                disabled={submitting}
                onClick={onClose}
              />
            </div>
          </div>

          {/* Scrollable form */}
          <div className={styles.scroll}>

            {/* Basics */}
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Basics</div>

              <div className={styles.field}>
                <Label htmlFor="nt-name">
                  Name<span className={styles.required}>*</span>
                </Label>
                <Input
                  id="nt-name"
                  placeholder="Agent template name"
                  maxLength={40}
                  value={name}
                  onChange={(_e, d) => setName(d.value)}
                />
                {showErrors && nameMissing && (
                  <span className={styles.fileError}>Name is required.</span>
                )}
              </div>

              <div className={styles.field}>
                <Label htmlFor="nt-description">
                  Description<span className={styles.required}>*</span>
                </Label>
                <Textarea
                  id="nt-description"
                  resize="vertical"
                  placeholder="Describe the agent's purpose and capabilities"
                  maxLength={160}
                  value={description}
                  onChange={(_e, d) => setDescription(d.value)}
                  textarea={{ style: { minHeight: '88px' } }}
                />
                {showErrors && descriptionMissing && (
                  <span className={styles.fileError}>Description is required.</span>
                )}
                <span className={styles.hint}>
                  Shown on the library card and the details page.
                </span>
              </div>

              {/* Publish status */}
              <div className={styles.field}>
                <Switch
                  className={styles.publishSwitch}
                  checked={publishStatus === 'active'}
                  label={{ 
                    children: 'Publish status', 
                    className: styles.publishSwitchLabel 
                  }} 
                  labelPosition="before"
                  onChange={(_e, data) =>
                    setPublishStatus(data.checked ? 'active' : 'inactive')
                  }
                />
                <span className={styles.hint}>Inactive templates are hidden from makers.</span>
              </div>

              {/* Icon & color */}
              <div className={styles.field}>
                <Label>
                  Icon &amp; color<span className={styles.required}>*</span>
                </Label>
                <div className={styles.iconColor}>
                  {/* Live preview of the selected icon over the accent colour */}
                  <span
                    className={styles.iconColorPreview}
                    style={{ backgroundImage: selectedGradient }}
                    aria-hidden="true"
                  >
                    {SelectedGlyph && <SelectedGlyph style={{ fontSize: '24px', width: '42px', height: '42px' }} />}
                  </span>

                  <div className={styles.iconColorRows}>
                    {/* Colour swatches */}
                    <div className={styles.swatches} role="radiogroup" aria-label="Accent color">
                      {ACCENT_SWATCHES.map((s) => (
                        <Tooltip key={s.key} content={s.label} relationship="label" withArrow>
                          <button
                            type="button"
                            aria-pressed={accent === s.key}
                            className={mergeClasses(
                              styles.swatch,
                              accent === s.key && styles.swatchSelected,
                            )}
                            style={{ backgroundImage: s.gradient }}
                            onClick={() => setAccent(s.key)}
                          />
                        </Tooltip>
                      ))}
                    </div>

                    {/* Icon options */}
                    <div className={styles.iconPicker} role="radiogroup" aria-label="Template icon">
                      {TEMPLATE_ICON_CHOICES.map((key) => {
                        const Glyph = ICON_MAP[key];
                        const selected = icon === key;
                        const label = TEMPLATE_ICON_LABELS[key] ?? key;
                        return (
                          <Tooltip key={key} content={label} relationship="label" withArrow>
                            <button
                              type="button"
                              aria-pressed={selected}
                              className={mergeClasses(
                                styles.iconOption,
                                selected && styles.iconOptionSelected,
                              )}
                              style={selected ? { backgroundImage: selectedGradient } : undefined}
                              onClick={() => setIcon(key)}
                            >
                              {Glyph && <Glyph style={{ fontSize: '18px' }} />}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Template package */}
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Template package</div>
              <div className={styles.field}>
                <Label>
                  {isEdit ? 'Replace template file (.zip)' : 'Template file (.zip)'}
                  {!isEdit && <span className={styles.required}>*</span>}
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className={styles.hiddenInput}
                  onChange={handleFileChange}
                />
                {file ? (
                  <div className={styles.fileRow}>
                    <span className={styles.fileInfo}>
                      <Document20Regular className={styles.fileIcon} aria-hidden="true" />
                      <span>
                        <span className={styles.fileName}>{file.name}</span>
                        {' · selected'}
                      </span>
                    </span>
                    <Button size="small" appearance="outline" disabled={submitting} onClick={pickFile}>
                      Change
                    </Button>
                  </div>
                ) : isEdit && initialValues?.fileName ? (
                  <div className={styles.fileRow}>
                    <span className={styles.fileInfo}>
                      <Document20Regular className={styles.fileIcon} aria-hidden="true" />
                      <span>
                        <span className={styles.fileName}>{initialValues.fileName}</span>
                        {' · current'}
                      </span>
                    </span>
                    <Button size="small" appearance="outline" disabled={submitting} onClick={pickFile}>
                      Replace file
                    </Button>
                  </div>
                ) : (
                  <div
                    className={styles.dropzone}
                    role="button"
                    tabIndex={0}
                    onClick={pickFile}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pickFile();
                      }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.files?.[0] ?? null;
                      if (!dropped) return;
                      acceptFile(dropped);
                    }}
                  >
                    <ArrowUpload20Regular className={styles.dropzoneIcon} aria-hidden="true" />
                    <span className={styles.dropzonePrimary}>
                      <Link>Choose a file</Link> or drag and drop
                    </span>
                    <span className={styles.dropzoneHint}>
                      Upload a Copilot Studio agent solution or declarative agent package (.zip, max 30 MB)
                    </span>
                  </div>
                )}
                {fileError && <span className={styles.fileError}>{fileError}</span>}
                {showErrors && fileMissing && !fileError && (
                  <span className={styles.fileError}>A .zip template file is required.</span>
                )}
              </div>
            </section>

            {/* Resources */}
            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                Resources <span className={styles.sectionTitleNormal}>(optional)</span>
              </div>
              <div className={styles.field}>
                <Label htmlFor="nt-learn-more">Learn more URL</Label>
                <Input
                  id="nt-learn-more"
                  type="url"
                  placeholder="Link to docs / overview (e.g., https://aka.ms/agent-docs)"
                  maxLength={500}
                  value={learnMoreUrl}
                  onChange={(_e, d) => setLearnMoreUrl(d.value)}
                />
                {learnMoreUrlInvalid && (
                  <span className={styles.fileError}>Enter a valid URL.</span>
                )}
              </div>
              <div className={styles.field}>
                <Label htmlFor="nt-setup-guide">Setup guide URL</Label>
                <Input
                  id="nt-setup-guide"
                  type="url"
                  placeholder="Link to setup steps (e.g., https://aka.ms/agent-setup)"
                  maxLength={500}
                  value={setupGuideUrl}
                  onChange={(_e, d) => setSetupGuideUrl(d.value)}
                />
                {setupGuideUrlInvalid && (
                  <span className={styles.fileError}>Enter a valid URL.</span>
                )}
              </div>
            </section>
          </div>

          {/* Submit error */}
          {submitError && (
            <MessageBar intent="error" style={{ margin: `0 ${tokens.spacingHorizontalXXL}` }}>
              <MessageBarBody>{submitError}</MessageBarBody>
            </MessageBar>
          )}

          {/* Footer */}
          <div className={mergeClasses(styles.footer, isEdit && !!onDelete && styles.footerSpread)}>
            {isEdit && onDelete && (
              <Button
                appearance="outline"
                className={styles.deleteButton}
                icon={<Delete20Regular />}
                disabled={submitting || deleting}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                Delete template
              </Button>
            )}
            <div className={styles.footerRight}>
              <Button appearance="secondary" disabled={submitting || deleting} onClick={onClose}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={submitting || deleting || (!!onSubmit && hasErrors)}
                icon={submitting ? <Spinner size="tiny" /> : undefined}
                onClick={() => void handleSubmit()}
              >
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>

      {/* Delete confirmation modal (edit mode only). */}
      {isEdit && onDelete && (
        <Dialog
          open={confirmDeleteOpen}
          onOpenChange={(_e, data) => {
            if (!data.open && !deleting) setConfirmDeleteOpen(false);
          }}
        >
          <DialogSurface className={styles.confirmSurface} aria-labelledby="delete-template-title">
            <DialogBody className={styles.confirmBody}>
              <h2 id="delete-template-title" className={styles.confirmTitle}>
                Delete this template?
              </h2>
              <p className={styles.confirmText}>
                <strong>{initialValues?.name ?? 'This template'}</strong> will be permanently
                removed from the Agent Library. Makers will no longer be able to find or install it.
                This action can&apos;t be undone.
              </p>
              <div className={styles.confirmActions}>
                <Button
                  appearance="secondary"
                  disabled={deleting}
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  className={styles.confirmDeleteButton}
                  icon={deleting ? <Spinner size="tiny" /> : undefined}
                  disabled={deleting}
                  onClick={() => void handleConfirmDelete()}
                >
                  Delete template
                </Button>
              </div>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </>
  );
};

export default NewTemplateDialog;
