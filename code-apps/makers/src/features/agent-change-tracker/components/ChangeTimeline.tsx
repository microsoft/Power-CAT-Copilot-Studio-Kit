import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import noResultsImage from '../../../shared/assets/no-results.png?inline';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Body1,
  Body1Strong,
  Caption1,
  Subtitle2,
  Badge,
  Button,
  Spinner,
  Avatar,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Field,
  Input,
  TabList,
  Tab,
  Tooltip,
  Dropdown,
  Option,
  Menu,
  MenuTrigger,
  MenuButton,
  MenuPopover,
  MenuList,
  MenuItemCheckbox,
  MenuItemRadio,
} from '@fluentui/react-components';
import {
  BotRegular,
  CommentRegular,
  WrenchRegular,
  BookRegular,
  SettingsRegular,
  FlashRegular,
  DocumentTextRegular,
  DocumentRegular,
  PeopleTeamRegular,
  PlugConnectedRegular,
  PuzzlePieceRegular,
  ClipboardTaskListLtrRegular,
  SparkleRegular,
  HistoryRegular,
  ArrowSyncRegular,
  ArrowRightRegular,
  CodeRegular,
  CopyRegular,
  CheckmarkRegular,
  DismissRegular,
  PersonRegular,
  RocketRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import {
  useAgentChangeLog,
  useAgentComponentParents,
  useAgentOwnership,
  useLocalPreviewMode,
  useComponentYaml,
  useCentralAgentMetadata,
  useComponentBodies,
  useTrackableAgents,
} from '../hooks/useChangeTracker';
import { groupBySaveTransaction, cleanSaveGroups, compareSaveGroups } from '../services/change-tracker-service';
import { buildCopilotStudioAgentUrl } from '../services/agent-links';
import { diffLines, diffSummary, toSideBySide, type DiffLine } from '../utils/text-diff';
import { flattenYaml, summarizeYamlDiff, summarizePlainTextChange, hasYamlContent, type FriendlyChange } from '../utils/yaml-summary';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { AuditSummary } from './AuditSummary';
import { componentIcon } from '../utils/component-icons';
import { type ChangeKind } from '../utils/audit-summary';
import {
  clampIsoDate,
  customRangeBounds,
  customRangeDays,
  defaultCustomRange,
  emptyCustomRange,
  formatCustomRangeLabel,
  fromIsoDate,
  isCustomRangeComplete,
  retentionWindow,
  retentionWindowDates,
  toIsoDate,
  type CustomRange,
} from '../utils/date-range';
import {
  CHANGE_TYPE_LABEL,
  COMPONENT_TYPE_LABEL,
  ChangeType,
  ComponentType,
  SourceTable,
  firstYamlKind,
  isScalarComponentType,
  refineComponentType,
  type ChangeLogEntry,
  type SaveGroup,
  type TrackingConfig,
} from '../contracts/change-tracker';

/** Resolve persisted option values defensively so older unknown types still render. */
function componentTypeLabel(type: ComponentType): string {
  return COMPONENT_TYPE_LABEL[type] ?? COMPONENT_TYPE_LABEL[ComponentType.Other];
}

function classificationBody(entry: ChangeLogEntry): string | undefined {
  return entry.classificationBody || entry.newValue || entry.oldValue;
}

const useStyles = makeStyles({
  root: {
    flex: '1 1 auto',
    minWidth: 0,
    height: '100%',
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    boxSizing: 'border-box',
    '@media (max-width: 639px)': {
      padding: tokens.spacingVerticalM,
    },
  },
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    // No padding: the root's 12px `gap` supplies the gap to the content below.
    flexShrink: 0,
  },
  dateRangeSurface: {
    maxWidth: '380px',
  },
  dateRangeContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  dateRangeHint: {
    color: tokens.colorNeutralForeground3,
  },
  dateTimeRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  dateField: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  timeField: {
    flex: '0 0 120px',
  },
  metaFilterRow: {
    // Filters sit above the tabs, right-aligned, on the same line as the
    // "Change history / Audit summary" label and its +/~/− counts.
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  tabList: {
    // 10px + the toolbar's 2px child gap = the same 12px used between every
    // other block, so the tabs sit in the shared vertical rhythm.
    marginTop: tokens.spacingVerticalMNudge,
  },
  toolbarTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  titleRow: {    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    minWidth: 0,
  },
  agentTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    // Real <h2>; Fluent's Text keeps the UA heading margin and this is a flex
    // item, so the margin has to be reset explicitly.
    margin: 0,
  },
  toolbarMeta: {    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  changeHistoryLabel: {
    marginLeft: '1px',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  ownerMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  ownerPublisherMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  ownerDetail: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
  },
  toolbarActions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    // Stays right-aligned whether it sits beside the label or wraps below it.
    marginLeft: 'auto',
    // Sized from its own width rather than the viewport's. This row sits beside
    // a 280-380px rail inside a page capped at 1280px, so a viewport breakpoint
    // measures the wrong box — above 1280px the viewport keeps growing while
    // this row's width does not. The basis is the width the four controls need
    // side by side; below it the row wraps under the label instead.
    flex: '1 1 460px',
    minWidth: 0,
    minHeight: '32px',
  },
  filterDropdown: {
    minWidth: 0,
    flex: '1 1 132px',
  },
  filterMenuButton: {
    minWidth: 0,
    width: '100%',
    // The date control carries the longest labels — "Last 30 days" or a full
    // custom range — so it starts wider than its siblings.
    flex: '1 1 170px',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightRegular,
    whiteSpace: 'nowrap',
  },
  filterDropdownLabel: {
    minWidth: 0,
  },
  userFilterMenuButton: {
    minWidth: 0,
    width: '100%',
    flex: '1 1 132px',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightRegular,
  },
  userFilterMenuButtonExpanded: {
    height: 'auto',
    alignItems: 'flex-start',
  },
  selectedUsers: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  selectedUser: {
    display: 'block',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  miniStat: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  miniStatAdded: { color: tokens.colorPaletteGreenForeground1 },
  miniStatUpdated: { color: tokens.colorPaletteMarigoldForeground1 },
  miniStatRemoved: { color: tokens.colorPaletteRedForeground1 },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  groupWrap: {
    display: 'flex',
  },
  groupCard: {
    flex: '1 1 auto',
    minWidth: 0,
    marginBottom: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    width: '100%',
  },
  groupHeaderText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    flex: '1 1 auto',
  },
  groupMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  mixChips: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  mixChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  mixDot: {
    width: '8px',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },
  mixAdded: { color: tokens.colorPaletteGreenForeground1 },
  mixUpdated: { color: tokens.colorPaletteMarigoldForeground1 },
  mixRemoved: { color: tokens.colorPaletteRedForeground1 },
  mixDotAdded: { backgroundColor: tokens.colorPaletteGreenForeground1 },
  mixDotUpdated: { backgroundColor: tokens.colorPaletteMarigoldForeground1 },
  mixDotRemoved: { backgroundColor: tokens.colorPaletteRedForeground1 },
  panel: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    transitionProperty: 'background-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowAccent: {
    alignSelf: 'stretch',
    width: '3px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
  },
  accentAdded: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  accentUpdated: { backgroundColor: tokens.colorPaletteMarigoldBackground3 },
  accentRemoved: { backgroundColor: tokens.colorPaletteRedBackground3 },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: '18px',
  },
  iconWrapAdded: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  iconWrapUpdated: {
    backgroundColor: tokens.colorPaletteMarigoldBackground1,
    color: tokens.colorPaletteMarigoldForeground1,
  },
  iconWrapRemoved: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  rowBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
    flex: '1 1 auto',
  },
  rowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  fieldName: {
    color: tokens.colorNeutralForeground3,
  },
  facts: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    marginTop: tokens.spacingVerticalXXS,
  },
  fact: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalXXS,
    minWidth: 0,
  },
  factSep: {
    color: tokens.colorNeutralForeground4,
    marginRight: tokens.spacingHorizontalXXS,
  },
  factLabel: {
    color: tokens.colorNeutralForeground3,
  },
  factValue: {
    color: tokens.colorNeutralForeground1,
    wordBreak: 'break-word',
  },
  inlineDiff: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  pill: {
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  arrow: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase400,
    flexShrink: 0,
  },
  iconDiff: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  iconFigure: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXXS,
    margin: 0,
  },
  iconThumb: {
    width: '48px',
    height: '48px',
    objectFit: 'contain',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  valueCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  beforeBox: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    textDecorationLine: 'line-through',
  },
  afterBox: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 1 auto',
    minWidth: 0,
    height: '100%',
    color: tokens.colorNeutralForeground3,
    gap: tokens.spacingVerticalS,
    textAlign: 'center',
    padding: tokens.spacingVerticalXXL,
    boxSizing: 'border-box',
  },
  emptyStateImg: {
    width: '120px',
    height: '120px',
  },
  emptyIcon: {
    fontSize: '34px',
  },
  versionBadge: {
    flexShrink: 0,
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  versionTag: {
    flexShrink: 0,
    fontFamily: tokens.fontFamilyMonospace,
    letterSpacing: '0.02em',
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  componentNote: {
    color: tokens.colorNeutralForeground3,
  },
  diffSummaryText: {
    color: tokens.colorNeutralForeground3,
  },
  changePanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalXXS,
    alignSelf: 'stretch',
  },
  changeList: {
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
  },
  propRow: {
    display: 'grid',
    gridTemplateColumns: '150px minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    minHeight: '34px',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  propRowCompact: {
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
  },
  propRowLong: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  propRowDivider: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
  propLabel: {
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    wordBreak: 'break-word',
  },
  propValue: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    rowGap: tokens.spacingVerticalXXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground1,
  },
  propLongBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  propLongUpdate: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  propLongUpdateSingle: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  propLongHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  propMoreRow: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  summaryLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  beforeToken: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    paddingTop: '1px',
    paddingBottom: '1px',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    textDecorationLine: 'line-through',
    wordBreak: 'break-word',
  },
  afterToken: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    paddingTop: '1px',
    paddingBottom: '1px',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    wordBreak: 'break-word',
  },
  tokenArrow: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  verbText: {
    color: tokens.colorNeutralForeground2,
  },
  longTextBlock: {
    alignSelf: 'stretch',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    maxHeight: '200px',
    overflowY: 'auto',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
  },
  longTextAfter: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground2,
    borderLeftColor: tokens.colorPaletteGreenBorderActive,
  },
  longTextBefore: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground2,
    borderLeftColor: tokens.colorPaletteRedBorderActive,
  },
  panelFooter: {
    marginTop: tokens.spacingVerticalXXS,
  },
  changeMore: {
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalXS,
  },
  diffBlock: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxHeight: '60vh',
    overflowY: 'auto',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  diffLine: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
  },
  diffMarker: {
    width: '12px',
    flexShrink: 0,
    textAlign: 'center',
    userSelect: 'none',
    color: tokens.colorNeutralForeground4,
  },
  diffText: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    flex: '1 1 auto',
    minWidth: 0,
  },
  diffAdd: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground2,
  },
  diffRemove: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground2,
  },
  diffSame: {
    color: tokens.colorNeutralForeground3,
  },
  diffGap: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    paddingLeft: tokens.spacingHorizontalXXL,
  },
  viewYamlRow: {
    marginTop: tokens.spacingVerticalXXS,
  },
  yamlSurface: {
    maxWidth: '1100px',
    width: '94vw',
  },
  yamlBlock: {
    maxHeight: '60vh',
    overflowY: 'auto',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  dialogHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  dialogHeadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  dialogChips: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  diffToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
    flexWrap: 'wrap',
  },
  splitGrid: {
    display: 'grid',
    gridTemplateColumns: '40px minmax(0, 1fr) 40px minmax(0, 1fr)',
    maxHeight: '60vh',
    overflow: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
  },
  splitHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: tokens.fontFamilyBase,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  splitHeadNo: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  lineNo: {
    textAlign: 'right',
    paddingRight: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground4,
    userSelect: 'none',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  splitCell: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
  },
  splitSame: {
    color: tokens.colorNeutralForeground3,
  },
  splitAdd: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground2,
  },
  splitRemove: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground2,
  },
  splitEmpty: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dialogLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '160px',
  },
});

const COMPONENT_ICON: Record<ComponentType, ReactElement> = {
  [ComponentType.Agent]: <BotRegular />,
  [ComponentType.Settings]: <SettingsRegular />,
  [ComponentType.Description]: <DocumentTextRegular />,
  [ComponentType.Instructions]: <DocumentRegular />,
  [ComponentType.Knowledge]: <BookRegular />,
  [ComponentType.Topic]: <CommentRegular />,
  [ComponentType.Connector]: <PlugConnectedRegular />,
  [ComponentType.Tool]: <WrenchRegular />,
  [ComponentType.Trigger]: <FlashRegular />,
  [ComponentType.ChildAgent]: <PeopleTeamRegular />,
  [ComponentType.Other]: <PuzzlePieceRegular />,
  [ComponentType.Evaluation]: <ClipboardTaskListLtrRegular />,
  [ComponentType.Skill]: <SparkleRegular />,
  [ComponentType.MCP]: <PlugConnectedRegular />,
};

function formatDateTime(value: string | undefined): string {
  if (!value) return 'Unknown time';
  const date = new Date(parseDateTime(value));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDateTime(value: string): number {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return Date.parse(normalized);
}

/**
 * True when an ISO value carries a real clock time. Dataverse returns date-only
 * columns as midnight UTC, which would render as a bogus local time, so those
 * are treated as having no time at all.
 */
function hasClockTime(value: string): boolean {
  const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return false;
  return !(m[1] === '00' && m[2] === '00' && (m[3] ?? '00') === '00');
}

/** Publish date, with the time appended only when the source records one. */
function formatPublished(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  if (!hasClockTime(value)) return day;
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function changeTypeColor(type: ChangeType | undefined): 'success' | 'warning' | 'danger' | 'informative' {
  if (type === ChangeType.Created) return 'success';
  if (type === ChangeType.Deleted) return 'danger';
  if (type === ChangeType.Updated) return 'warning';
  return 'informative';
}

/** Render the complete color-coded line diff. */
function DiffView({ before, after }: { before: string; after: string }) {
  const styles = useStyles();
  const lines = useMemo<DiffLine[]>(() => diffLines(before, after), [before, after]);

  return (
    <div className={styles.diffBlock}>
      {lines.map((line, idx) => {
        if (line.type === 'gap') {
          return (
            <div key={idx} className={styles.diffGap}>
              ⋯
            </div>
          );
        }
        const toneClass =
          line.type === 'add' ? styles.diffAdd : line.type === 'remove' ? styles.diffRemove : styles.diffSame;
        const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '−' : '\u00A0';
        return (
          <div key={idx} className={`${styles.diffLine} ${toneClass}`}>
            <span className={styles.diffMarker}>{marker}</span>
            <span className={styles.diffText}>{line.text || '\u00A0'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Render a side-by-side before/after comparison with aligned line numbers. */
function SplitDiff({ before, after }: { before: string; after: string }) {
  const styles = useStyles();
  const rows = useMemo(() => toSideBySide(diffLines(before, after)), [before, after]);

  const leftTone = (t: 'same' | 'remove' | 'empty') =>
    t === 'remove' ? styles.splitRemove : t === 'empty' ? styles.splitEmpty : styles.splitSame;
  const rightTone = (t: 'same' | 'add' | 'empty') =>
    t === 'add' ? styles.splitAdd : t === 'empty' ? styles.splitEmpty : styles.splitSame;

  return (
    <div className={styles.splitGrid}>
      <div className={styles.splitHeadNo} />
      <div className={styles.splitHead}>Before</div>
      <div className={styles.splitHeadNo} />
      <div className={styles.splitHead}>After</div>
      {rows.map((r, idx) => (
        <Fragment key={idx}>
          <div className={`${styles.lineNo} ${leftTone(r.leftType)}`}>{r.leftNo ?? ''}</div>
          <div className={`${styles.splitCell} ${leftTone(r.leftType)}`}>{r.left || '\u00A0'}</div>
          <div className={`${styles.lineNo} ${rightTone(r.rightType)}`}>{r.rightNo ?? ''}</div>
          <div className={`${styles.splitCell} ${rightTone(r.rightType)}`}>{r.right || '\u00A0'}</div>
        </Fragment>
      ))}
    </div>
  );
}

interface YamlDialogProps {
  entry: ChangeLogEntry;
  version?: string;
  orgUrl?: string;
  localPreview: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "View YAML" dialog: complete before/after comparison (split or unified). */
function YamlDialog({ entry, version, orgUrl, localPreview, open, onOpenChange }: YamlDialogProps) {
  const styles = useStyles();
  const [view, setView] = useState<'split' | 'unified'>('split');
  const [copied, setCopied] = useState(false);

  const componentType = refineComponentType(
    (entry.componentType ?? ComponentType.Other) as ComponentType,
    classificationBody(entry),
  );
  const displayType = displayComponentType(entry);
  const componentLabel = isModelChange(entry)
    ? MODEL_LABEL
    : componentLabelFor(displayType, classificationBody(entry));
  const isDeleted = entry.changeType === ChangeType.Deleted;

  const before = entry.oldValue ?? '';
  const storedAfter = entry.newValue ?? '';

  // When a row stored no "after" (e.g. a baseline creation), read the live YAML
  // so the dialog can always show the complete current definition.
  const needLive = open && !localPreview && !isDeleted && storedAfter.length === 0;
  const liveYaml = useComponentYaml(entry.componentId, orgUrl, needLive);
  const after = storedAfter || (liveYaml.data ?? '');
  const afterIsLive = storedAfter.length === 0 && (liveYaml.data ?? '').length > 0;

  const summary = useMemo(() => diffSummary(diffLines(before, after)), [before, after]);
  const loading = needLive && liveYaml.isLoading;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(after || before);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={styles.yamlSurface}>
        <DialogBody>
          <DialogTitle>
            <div className={styles.dialogHead}>
              <div className={styles.dialogHeadRow}>
                <span className={styles.iconWrap}>{COMPONENT_ICON[componentType]}</span>
                <Body1Strong>{entry.componentName || componentLabel}</Body1Strong>
                <Caption1 className={styles.fieldName}>· {componentLabel}</Caption1>
                {version !== undefined && (
                  <Badge className={styles.versionBadge} appearance="outline" color="informative">
                    v{version}
                  </Badge>
                )}
              </div>
              <div className={styles.dialogChips}>
                <Badge appearance="tint" color={changeTypeColor(entry.changeType)}>
                  {entry.changeType !== undefined ? CHANGE_TYPE_LABEL[entry.changeType] : 'Changed'}
                </Badge>
                {summary.added > 0 && (
                  <Badge appearance="tint" color="success">
                    +{summary.added}
                  </Badge>
                )}
                {summary.removed > 0 && (
                  <Badge appearance="tint" color="danger">
                    −{summary.removed}
                  </Badge>
                )}
                {afterIsLive && (
                  <Caption1 className={styles.componentNote}>Showing current live YAML</Caption1>
                )}
              </div>
            </div>
          </DialogTitle>
          <DialogContent>
            <div className={styles.diffToolbar}>
              <TabList
                selectedValue={view}
                onTabSelect={(_, data) => setView(data.value as 'split' | 'unified')}
                size="small"
              >
                <Tab value="split">Side by side</Tab>
                <Tab value="unified">Unified</Tab>
              </TabList>
              {view === 'unified' && (
                <Tooltip content={copied ? 'Copied' : 'Copy YAML'} relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
                    onClick={onCopy}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </Tooltip>
              )}
            </div>
            {loading ? (
              <div className={styles.dialogLoading}>
                <Spinner size="small" label="Loading YAML…" />
              </div>
            ) : view === 'split' ? (
              <SplitDiff before={before} after={after} />
            ) : (
              <DiffView before={before} after={after} />
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function diffSummaryText(added: number, removed: number): string {
  if (added === 0 && removed === 0) return 'Content changed';
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  return `${parts.join(' · ')} ${added + removed === 1 ? 'line' : 'lines'}`;
}

const MAX_INLINE_CHANGES = 5;

/**
 * The "Agent icon" setting stores the icon's base64 image bytes so the timeline
 * can render before/after thumbnails.
 */
const ICON_SETTING_LABEL = 'Agent icon';

/**
 * Settings label for the agent's secondary (supported) languages. Changes to
 * this list are additive/subtractive by nature, so the card renders only what
 * changed (added/removed chips) rather than a full before→after replacement.
 */
const SECONDARY_LANGUAGES_LABEL = 'Secondary languages';

/**
 * Settings label for the agent's enabled channels (Settings > Channels). Like
 * secondary languages, channels are a set, so the card renders only what
 * changed (added/removed chips) instead of a full before→after replacement that
 * would misread an addition as removing the existing channels.
 */
const CHANNELS_LABEL = 'Channels';

/** Suggested prompts are stored as one pipe-delimited scalar value. */
const SUGGESTED_PROMPTS_LABEL = 'Suggested prompts';

/**
 * Friendly display names for the channel identifiers Copilot Studio stores in
 * configuration.channels (displayName is typically null, so the app tracks the
 * raw channelId). Render-only: the stored/reconciled value stays the channelId,
 * so an unknown id simply falls back to its raw token.
 */
const CHANNEL_LABELS: Record<string, string> = {
  msteams: 'Microsoft Teams',
  msteamsphone: 'Teams phone (voice)',
  microsoft365copilot: 'Microsoft 365 Copilot',
  directline: 'Web app',
  webchat: 'Demo website',
  directlinespeech: 'Direct Line Speech',
  facebook: 'Facebook',
  slack: 'Slack',
  telegram: 'Telegram',
  twilio: 'Twilio (SMS)',
  line: 'LINE',
  groupme: 'GroupMe',
  email: 'Email',
};

const BOT_CHOICE_LABELS: Record<string, Record<string, string>> = {
  accesscontrolpolicy: {
    '0': 'Any',
    '1': 'Agent readers',
    '2': 'Group membership',
    '3': 'Any (multi-tenant)',
  },
  authenticationmode: {
    '0': 'Unspecified',
    '1': 'No authentication',
    '2': 'Authenticate with Microsoft',
    '3': 'Authenticate manually',
    '4': 'Authenticate manually',
  },
  authenticationtrigger: { '0': 'As Needed', '1': 'Always' },
  statecode: { '0': 'Active', '1': 'Inactive' },
  statuscode: {
    '1': 'Provisioned',
    '2': 'Deprovisioned',
    '3': 'Provisioning',
    '4': 'ProvisionFailed',
    '5': 'MissingLicense',
  },
  runtimeprovider: { '0': 'Power Virtual Agents', '1': 'Nuance Mix Shell' },
  componentstate: {
    '0': 'Published',
    '1': 'Unpublished',
    '2': 'Deleted',
    '3': 'Deleted Unpublished',
  },
  ismanaged: { '0': 'Unmanaged', '1': 'Managed' },
};

const LANGUAGE_LABELS: Record<string, string> = {
  '1025': 'Arabic', '1026': 'Bulgarian', '1027': 'Catalan', '1028': 'Chinese (Traditional)',
  '1029': 'Czech', '1030': 'Danish', '1031': 'German', '1032': 'Greek',
  '1033': 'English', '1034': 'Spanish', '1035': 'Finnish', '1036': 'French',
  '1037': 'Hebrew', '1038': 'Hungarian', '1040': 'Italian', '1041': 'Japanese',
  '1042': 'Korean', '1043': 'Dutch', '1044': 'Norwegian', '1045': 'Polish',
  '1046': 'Portuguese (Brazilian)', '1048': 'Romanian', '1049': 'Russian', '1050': 'Croatian',
  '1051': 'Slovak', '1053': 'Swedish', '1054': 'Thai', '1055': 'Turkish',
  '1057': 'Indonesian', '1058': 'Ukrainian', '1060': 'Slovenian', '1061': 'Estonian',
  '1062': 'Latvian', '1063': 'Lithuanian', '1066': 'Vietnamese', '1069': 'Basque',
  '1081': 'Hindi', '1086': 'Malaysian', '1087': 'Kazakh', '1110': 'Galician',
  '2052': 'Chinese (Simplified)', '2057': 'English (United Kingdom)',
  '2070': 'Portuguese (Portugal)', '2074': 'Serbian (Latin)',
  '3081': 'English (Australia)', '3084': 'French (Canada)',
  '3098': 'Serbian (Cyrillic)', '5129': 'English (New Zealand)',
  '20490': 'Spanish (Puerto Rico)', '21514': 'Spanish (United States)',
};

/** Translate a bot choice code for display while retaining unknown values verbatim. */
function botChoiceValue(fieldName: string | undefined, value: string | undefined): string {
  if (!hasRenderableValue(value)) return '';
  const field = fieldName?.trim().toLowerCase() ?? '';
  const code = value.trim();
  if (field === 'language') return LANGUAGE_LABELS[code] ?? code;
  return BOT_CHOICE_LABELS[field]?.[code] ?? displayScalarValue(value);
}

/** Normalize stored multi-select LCIDs and return their readable language names. */
function supportedLanguageValues(value: string | undefined): string[] {
  if (!hasRenderableValue(value)) return [];
  const source = value.trim();
  let values: unknown = source;
  if (source.startsWith('[')) {
    try {
      values = JSON.parse(source) as unknown;
    } catch {
      values = source;
    }
  }
  const codes = Array.isArray(values)
    ? values.map(String)
    : String(values).split(/[;,]/);
  return codes
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => LANGUAGE_LABELS[code] ?? code);
}

/** Friendly label for a channel identifier, falling back to the raw id. */
function channelLabel(channelId: string): string {
  return CHANNEL_LABELS[channelId.trim().toLowerCase()] ?? channelId.trim();
}

/**
 * Display-only relabels for settings whose Copilot Studio UI name has changed
 * since the capture flow's stored label. The stored `componentName` (and the
 * reconciler's matching key) stays as the flow writes it — only the rendered
 * title is swapped. `optInUseLatestModels` is now surfaced as "Deep reasoning
 * (preview)" in the designer.
 */
const SETTING_DISPLAY_RELABEL: Record<string, string> = {
  'Use latest models': 'Deep reasoning (preview)',
  'Code Interpreter / File analysis': 'File uploads',
};

/** Friendly title for settings whose stored component name is generated. */
function settingDisplayName(entry: ChangeLogEntry): string | undefined {
  const kinds = [firstYamlKind(entry.oldValue), firstYamlKind(entry.newValue)];
  if (kinds.some((kind) => kind === 'defaultfeedbackcollection' || kind === 'nofeedbackcollection')) {
    return 'Feedback collection';
  }
  return (entry.componentName && SETTING_DISPLAY_RELABEL[entry.componentName]) || entry.componentName;
}

function feedbackCollectionValue(value: string | undefined): string | undefined {
  const kind = firstYamlKind(value);
  if (kind === 'defaultfeedbackcollection') return 'Enabled';
  if (kind === 'nofeedbackcollection') return 'Disabled';
  return undefined;
}

/** Normalize stored boolean scalars to the terminology used throughout the UI. */
function displayScalarValue(value: string | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'true') return 'Enabled';
  if (normalized === 'false') return 'Disabled';
  return hasRenderableValue(value) ? value ?? '' : '';
}

function hasRenderableValue(value: string | undefined): value is string {
  const normalized = (value ?? '').trim();
  return normalized.length > 0 && normalized !== '~' && normalized !== '-' && normalized !== '—';
}

/**
 * Build a data URI from a stored icon value. Returns null when the value isn't a
 * renderable base64 image (empty, or a legacy fingerprint like `len:1234:…`),
 * so callers can fall back to a text note. The image MIME type is sniffed from
 * the base64 magic prefix (PNG by default).
 */
function iconDataUri(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  if (v.length < 100) return null;
  if (v.startsWith('data:')) return v;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(v)) return null;
  let mime = 'image/png';
  if (v.startsWith('/9j/')) mime = 'image/jpeg';
  else if (v.startsWith('R0lGOD')) mime = 'image/gif';
  else if (v.startsWith('UklGR')) mime = 'image/webp';
  else if (v.startsWith('PHN2Zy') || v.startsWith('PD94bWw')) mime = 'image/svg+xml';
  return `data:${mime};base64,${v}`;
}

/**
 * Per-component-type allowlist of YAML fields worth surfacing on the card. Only
 * these (matched on the last path segment, case-insensitive) are summarised;
 * everything else stays in "View YAML". Absent type => show all fields.
 */
const RELEVANT_FIELDS: Partial<Record<ComponentType, string[]>> = {
  [ComponentType.Agent]: ['displayname', 'description', 'instructions'],
  [ComponentType.ChildAgent]: ['displayname', 'modeldisplayname', 'description', 'modeldescription', 'instructions'],
  [ComponentType.Topic]: ['displayname', 'description', 'triggerqueries', 'text', 'speak', 'prompt'],
  [ComponentType.Knowledge]: ['displayname', 'description', 'site', 'url'],
  [ComponentType.Tool]: ['displayname', 'modeldisplayname', 'description', 'modeldescription'],
  [ComponentType.Connector]: ['displayname', 'modeldisplayname', 'description', 'modeldescription'],
  [ComponentType.MCP]: ['displayname', 'modeldisplayname', 'description', 'modeldescription', 'connectorid'],
  [ComponentType.Instructions]: ['displayname', 'description', 'instructions', 'responseinstructions', 'aisettings.model.kind', 'modelnamehint', 'webbrowsing', 'codeinterpreter', 'imageinput'],
  [ComponentType.Evaluation]: ['displayname', 'name', 'description', 'input', 'expectedoutput'],
};

/**
 * Resolve the card label for a component, adding evaluation sub-types so a test
 * set and its questions read distinctly. Copilot Studio stores an evaluation
 * set as `kind: EvaluationSet` and each question as `kind: EvaluationData`; the
 * grader is `kind: GeneralQualityGrader`.
 */
function componentLabelFor(type: ComponentType, body: string | undefined): string {
  if (firstYamlKind(body) === 'closedlistentity') return 'Entity';
  if (type === ComponentType.Evaluation) {
    switch (firstYamlKind(body)) {
      case 'evaluationset':
        return 'Evaluation set';
      case 'evaluationdata':
      case 'multiturnevaluationcase':
      case 'singleturnevaluationcase':
        return 'Evaluation question';
      case 'generalqualitygrader':
        return 'Evaluation grader';
      default:
        return componentTypeLabel(ComponentType.Evaluation);
    }
  }
  // A connected agent (new-designer "Agents" panel) is authored as
  // `kind: ConnectedAgentTool`; the classic designer authors it as
  // `kind: TaskDialog` with a nested `InvokeConnectedAgentTaskAction`. Label
  // both "Connected agent" to match Copilot Studio, while other child agents
  // keep the default "Child Agent".
  if (
    type === ComponentType.ChildAgent &&
    (firstYamlKind(body) === 'connectedagenttool' ||
      (body ?? '').toLowerCase().includes('invokeconnectedagenttaskaction'))
  ) {
    return 'Connected agent';
  }
  return componentTypeLabel(type);
}

/**
 * A noun for a component type that reads naturally inside a sentence.
 *
 * "Other" is a bucket label, not a thing — "This other was removed." is not
 * English. Every real type ("Topic", "Knowledge source", "Child Agent") already
 * reads fine lower-cased, so only the catch-all needs a generic stand-in.
 */
function sentenceNoun(componentLabel: string): string {
  const lower = componentLabel.toLowerCase();
  return lower === 'other' ? 'component' : lower;
}

/**
 * Drop any "Display name" entry from the root agent (Instructions) component
 * diff. The agent name is surfaced authoritatively via the "Agent name"
 * settings card, so a displayName delta embedded in the gpt body is redundant
 * noise (older captures also add it purely from serialization drift). Removing
 * it keeps the card focused on real instruction/model changes and lets the
 * model-/settings-only detectors classify the header correctly.
 */
function dropPhantomDisplayName(items: FriendlyChange[]): FriendlyChange[] {
  return items.filter((c) => c.label !== 'Display name');
}

function collapseAgentRenameCompanions(groups: SaveGroup[]): SaveGroup[] {
  return groups.map((group) => {
    const agentRenames = group.entries.filter(
      (entry) =>
        entry.sourceTable === SourceTable.Agent &&
        entry.changeType === ChangeType.Updated &&
        entry.fieldName === 'name',
    );
    if (agentRenames.length === 0) return group;

    const entries = group.entries.filter((entry) => {
      if (entry.sourceTable !== SourceTable.Component || entry.changeType !== ChangeType.Updated) return true;
      const type = refineComponentType(
        (entry.componentType ?? ComponentType.Other) as ComponentType,
        entry.newValue || entry.oldValue,
      );
      if (type !== ComponentType.Instructions) return true;

      if (entry.fieldName === 'name') {
        return !agentRenames.some(
          (rename) => rename.oldValue === entry.oldValue && rename.newValue === entry.newValue,
        );
      }
      if (entry.fieldName !== 'data') return true;

      const yamlChanges = summarizeYamlDiff(entry.oldValue ?? '', entry.newValue ?? '');
      return yamlChanges.length === 0 || yamlChanges.some((change) => change.label !== 'Display name');
    });
    return { ...group, entries };
  });
}

/** Remove opaque data/status companions when the same save already shows the component state change. */
function collapseStateDataCompanions(groups: SaveGroup[]): SaveGroup[] {
  return groups.map((group) => {
    const stateComponentIds = new Set(
      group.entries
        .filter((entry) => entry.componentId && isStateCodeField(entry.fieldName))
        .map((entry) => entry.componentId as string),
    );
    if (stateComponentIds.size === 0) return group;

    const entries = group.entries.filter((entry) => {
      if (
        !entry.componentId ||
        !stateComponentIds.has(entry.componentId) ||
        !['data', 'content', 'statuscode'].includes(entry.fieldName?.toLowerCase() ?? '')
      ) {
        return true;
      }
      const type = refineComponentType(
        (entry.componentType ?? ComponentType.Other) as ComponentType,
        classificationBody(entry),
      );
      const summary = friendlyChangesFor(entry.oldValue ?? '', entry.newValue ?? '', type, entry.fieldName);
      return summary.items.length > 0 || summary.fallback.length > 0;
    });
    return { ...group, entries };
  });
}

/** Collapse duplicate data/content projections of the same component payload within one save. */
function collapseDuplicateComponentPayloads(groups: SaveGroup[]): SaveGroup[] {
  return groups.map((group) => {
    const seen = new Set<string>();
    const entries = group.entries.filter((entry) => {
      if (!entry.componentId || entry.fieldName?.startsWith('__instruction_')) return true;
      const key = [
        entry.componentId,
        entry.changeType ?? '',
        entry.componentType ?? '',
        entry.oldValue ?? '',
        entry.newValue ?? '',
      ].join('\u0000');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...group, entries };
  });
}

/** Remove a Skill's scalar description companion when its YAML already carries the same delta. */
function collapseSkillDescriptionCompanions(groups: SaveGroup[]): SaveGroup[] {
  return groups.map((group) => {
    const skillBodies = group.entries.filter(
      (entry) =>
        entry.componentId &&
        ['data', 'content'].includes(entry.fieldName?.toLowerCase() ?? '') &&
        (firstYamlKind(entry.oldValue) === 'inlineagentskill' || firstYamlKind(entry.newValue) === 'inlineagentskill'),
    );
    if (skillBodies.length === 0) return group;

    const entries = group.entries.filter((entry) => {
      if (!entry.componentId || entry.fieldName?.toLowerCase() !== 'description') return true;
      return !skillBodies.some((body) => {
        if (body.componentId !== entry.componentId) return false;
        const previous = inlineSkillSummary(body.oldValue ?? '').description;
        const current = inlineSkillSummary(body.newValue ?? '').description;
        return previous === (entry.oldValue ?? '') && current === (entry.newValue ?? '');
      });
    });
    return { ...group, entries };
  });
}

/** Remove scalar capability rows already represented by an Instructions settings diff. */
function collapseInstructionSettingCompanions(groups: SaveGroup[]): SaveGroup[] {
  return groups.map((group) => {
    const instructionChanges = group.entries.flatMap((entry) => {
      const type = refineComponentType(
        (entry.componentType ?? ComponentType.Other) as ComponentType,
        classificationBody(entry),
      );
      if (type !== ComponentType.Instructions || entry.changeType !== ChangeType.Updated) return [];
      return instructionSettingsChanges(entry.oldValue ?? '', entry.newValue ?? '');
    });
    if (instructionChanges.length === 0) return group;

    const entries = group.entries.filter((entry) => {
      const componentName = entry.componentName?.trim().toLowerCase();
      if (componentName !== 'code interpreter / file analysis' && componentName !== 'file uploads') return true;
      return !instructionChanges.some(
        (change) =>
          change.label === 'Code interpreter' &&
          displayScalarValue(change.before) === displayScalarValue(entry.oldValue) &&
          displayScalarValue(change.after) === displayScalarValue(entry.newValue),
      );
    });
    return { ...group, entries };
  });
}

/** Collapse MCP's `description` / `modelDescription` aliases into one field. */
function normalizeMcpDescriptions(items: FriendlyChange[]): FriendlyChange[] {
  const hasDescription = items.some((item) => item.label === 'Description');
  if (hasDescription) return items.filter((item) => item.label !== 'Model description');
  return items.map((item) =>
    item.label === 'Model description'
      ? { ...item, label: 'Description', text: item.text.replace(/^Model description/, 'Description') }
      : item,
  );
}

/** Present connected-agent identity fields without their storage-model prefix. */
function normalizeChildAgentFields(items: FriendlyChange[]): FriendlyChange[] {
  const hasModelName = items.some((item) => item.label === 'Model display name');
  const hasModelDescription = items.some((item) => item.label === 'Model description');

  return items.flatMap((item) => {
    if (item.label === 'Model display name') {
      return [{ ...item, label: 'Name', text: item.text.replace(/^Model display name/, 'Name') }];
    }
    if (item.label === 'Display name') {
      return hasModelName
        ? []
        : [{ ...item, label: 'Name', text: item.text.replace(/^Display name/, 'Name') }];
    }
    if (item.label === 'Model description') {
      return [{ ...item, label: 'Description', text: item.text.replace(/^Model description/, 'Description') }];
    }
    if (item.label === 'Description' && hasModelDescription) {
      return [];
    }
    return [item];
  });
}

/** Hide Skill payload metadata that is only useful in the raw YAML view. */
function normalizeSkillFields(items: FriendlyChange[]): FriendlyChange[] {
  return items.filter((item) => item.label !== 'Content' && item.label !== 'Kind');
}

/** Hide the technical flowName GUID; the authored value remains available in View YAML. */
function normalizeTriggerFields(items: FriendlyChange[]): FriendlyChange[] {
  return items.filter((item) => item.label !== 'Flow name');
}

interface InlineSkillSummary {
  description: string;
  purpose: string;
  instructionCount: number;
}

function markdownSection(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingMatch = new RegExp(`^##\\s+${escaped}\\s*$`, 'im').exec(content);
  if (!headingMatch) return '';
  const remainder = content.slice(headingMatch.index + headingMatch[0].length);
  const nextHeading = remainder.search(/^##\s+/m);
  return (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
}

/** Extract compact metadata from the Markdown stored inside InlineAgentSkill.content. */
function inlineSkillSummary(body: string): InlineSkillSummary {
  const content = Array.from(flattenYaml(body)).find(([path]) => path.toLowerCase() === 'content')?.[1] ?? '';
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const metadata = new Map(Array.from(flattenYaml(frontmatter), ([key, value]) => [key.toLowerCase(), value]));
  const purpose = markdownSection(content, 'Purpose').replace(/\s+/g, ' ').trim();
  const instructions = markdownSection(content, 'Instructions');
  return {
    description: metadata.get('description') ?? '',
    purpose,
    instructionCount: instructions.match(/^\s*\d+\.\s+/gm)?.length ?? 0,
  };
}

function inlineSkillFriendlyChanges(before: string, after: string): FriendlyChange[] {
  const previous = inlineSkillSummary(before);
  const current = inlineSkillSummary(after);
  const changes = summarizePlainTextChange('description', previous.description, current.description);
  if (previous.purpose !== previous.description || current.purpose !== current.description) {
    changes.push(...summarizePlainTextChange('purpose', previous.purpose, current.purpose));
  }
  changes.push(
    ...summarizePlainTextChange(
      'instructions',
      previous.instructionCount ? `${previous.instructionCount} steps` : '',
      current.instructionCount ? `${current.instructionCount} steps` : '',
    ),
  );
  return changes;
}

/** Hide storage discriminators already represented by friendly settings titles. */
function normalizeSettingsComponentFields(items: FriendlyChange[]): FriendlyChange[] {
  return items.filter((item) => item.label !== 'Kind');
}

const SETTINGS_COMPONENT_TITLES: Record<string, string> = {
  ivrbotsettings: 'IVR settings',
  contentmoderationsettings: 'Content moderation settings',
};

function settingsComponentTitle(body: string | undefined): string | undefined {
  return SETTINGS_COMPONENT_TITLES[firstYamlKind(body) ?? ''];
}

function closedListEntityValues(body: string): string {
  const items = new Map<number, { displayName?: string; synonyms: string[] }>();
  for (const [path, value] of flattenYaml(body)) {
    const match = path.match(/^items\.\[(\d+)\]\.(displayName|synonyms\.\[\d+\])$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const item = items.get(index) ?? { synonyms: [] };
    if (match[2].toLowerCase() === 'displayname') item.displayName = value;
    else item.synonyms.push(value);
    items.set(index, item);
  }
  return [...items.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, item]) => {
      const name = item.displayName ?? 'Unnamed value';
      return item.synonyms.length > 0 ? `${name} (synonyms: ${item.synonyms.join(', ')})` : name;
    })
    .join('; ');
}

function closedListEntityFriendlyChanges(before: string, after: string): FriendlyChange[] {
  const beforeFields = flattenYaml(before);
  const afterFields = flattenYaml(after);
  const smartMatching = summarizePlainTextChange(
    'smartMatching',
    beforeFields.has('smartMatchingEnabled')
      ? displayScalarValue(beforeFields.get('smartMatchingEnabled'))
      : '',
    afterFields.has('smartMatchingEnabled')
      ? displayScalarValue(afterFields.get('smartMatchingEnabled'))
      : '',
  );
  const values = summarizePlainTextChange(
    'values',
    closedListEntityValues(before),
    closedListEntityValues(after),
  );
  return [...smartMatching, ...values];
}

interface ConversationStarter {
  title?: string;
  text?: string;
}

function conversationStarters(body: string): Map<number, ConversationStarter> {
  const starters = new Map<number, { title?: string; text?: string }>();
  for (const [path, value] of flattenYaml(body)) {
    const match = path.match(/(?:^|\.)conversationStarters\.\[(\d+)\]\.(title|text)$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const starter = starters.get(index) ?? {};
    starter[match[2].toLowerCase() as 'title' | 'text'] = value;
    starters.set(index, starter);
  }
  return starters;
}

/** Present each changed conversation starter as readable Title and Text rows. */
function conversationStarterChanges(before: string, after: string): FriendlyChange[] {
  const beforeStarters = conversationStarters(before);
  const afterStarters = conversationStarters(after);
  const indexes = [...new Set([...beforeStarters.keys(), ...afterStarters.keys()])].sort(
    (left, right) => left - right,
  );

  return indexes.flatMap((index) => {
    const previous = beforeStarters.get(index);
    const next = afterStarters.get(index);
    const title = summarizePlainTextChange('title', previous?.title ?? '', next?.title ?? '');
    const text = summarizePlainTextChange('text', previous?.text ?? '', next?.text ?? '');
    return [
      ...title.map((change) => ({ ...change, label: 'Title' })),
      ...text.map((change) => ({ ...change, label: 'Text' })),
    ];
  });
}

/** All relevant Instructions changes, including fields presented as Settings. */
function instructionsRelevantDiff(before: string, after: string): FriendlyChange[] {
  const relevant = RELEVANT_FIELDS[ComponentType.Instructions];
  const fields = dropPhantomDisplayName(
    summarizeYamlDiff(before, after, relevant ? new Set(relevant) : undefined),
  );
  const prompts = conversationStarterChanges(before, after);
  return [...fields, ...prompts];
}

/**
 * Instructions rows shown on the card. Model is presented only through the
 * dedicated Settings card, while remaining part of the full diff for type
 * classification and YAML inspection.
 */
function instructionsFriendlyChanges(before: string, after: string): FriendlyChange[] {
  const starters = conversationStarterChanges(before, after);
  if (starters.length > 0) return starters;
  return instructionsRelevantDiff(before, after).filter((item) => item.label !== 'Model');
}

const INSTRUCTION_SETTINGS_FIELD = '__instruction_settings';
const INSTRUCTION_CONTENT_FIELD = '__instruction_content';

interface EvaluationSetDetails {
  displayName?: string;
  graders: string[];
}

const EVALUATION_GRADER_LABELS: Record<string, string> = {
  generalqualitygrader: 'General quality',
  exactmatchgrader: 'Exact match',
  textsimilaritygrader: 'Text similarity',
  comparemeaninggrader: 'Compare meaning',
  containsanygrader: 'Contains any keyword',
  containsallgrader: 'Contains all keywords',
  toolcallgrader: 'Tool call',
  promptgrader: 'Custom prompt',
};

const EVALUATION_GRADER_NAME_LABELS: Record<string, string> = {
  tool_name: 'Tool Use',
};

function evaluationSetDetails(body: string): EvaluationSetDetails {
  const fields = flattenYaml(body);
  const graders = new Map<number, { kind?: string; name?: string }>();
  for (const [path, value] of fields) {
    const match = path.match(/^graders\.\[(\d+)\]\.(kind|name)$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const grader = graders.get(index) ?? {};
    if (match[2].toLowerCase() === 'kind') grader.kind = value;
    else grader.name = value;
    graders.set(index, grader);
  }

  return {
    displayName: fields.get('displayName')?.trim() || undefined,
    graders: [...graders.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, grader]) => {
        const kind = grader.kind?.trim() ?? '';
        const label =
          EVALUATION_GRADER_LABELS[kind.toLowerCase()] ??
          (kind.replace(/Grader$/i, '') || 'Grader');
        const rawName = grader.name?.trim();
        if (!rawName) return label;
        const nameLabel = EVALUATION_GRADER_NAME_LABELS[rawName.toLowerCase()] ?? rawName;
        return kind.toLowerCase() === 'toolcallgrader' ? nameLabel : `${label}: ${nameLabel}`;
      }),
  };
}

function evaluationSetFriendlyChanges(before: string, after: string): FriendlyChange[] {
  const previous = evaluationSetDetails(before);
  const current = evaluationSetDetails(after);
  const changes = summarizePlainTextChange(
    'displayName',
    previous.displayName ?? '',
    current.displayName ?? '',
  );
  const beforeGraders = previous.graders.join(', ');
  const afterGraders = current.graders.join(', ');
  if (beforeGraders !== afterGraders) {
    changes.push({
      kind: beforeGraders ? (afterGraders ? 'changed' : 'removed') : 'added',
      label: 'Graders',
      before: beforeGraders || undefined,
      after: afterGraders || undefined,
      text: afterGraders ? `Graders changed to ${afterGraders}` : 'Graders removed',
    });
  }
  return changes;
}

/**
 * The model field on the Instructions component, matched on the last path
 * segment (case-insensitive) — same convention as {@link RELEVANT_FIELDS}.
 */
const MODEL_FIELDS = new Set(['modelnamehint']);

/** Copilot Studio model series mapped to their maker-facing display names. */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  gpt41: 'GPT-4.1',
  gpt5chat: 'GPT-5 Chat',
  gpt5auto: 'GPT-5 Auto',
  gpt5reasoning: 'GPT-5 Reasoning',
  gpt56reasoning: 'GPT-5.6 Reasoning',
  gpt51chatthinky: 'GPT-5.3 Chat',
  gpt55chat: 'GPT-5.5 Chat',
  sonnet4: 'Claude Sonnet 4.5',
  sonnet5: 'Claude Sonnet 5',
  'claude-opus-5': 'Claude Opus 5',
  'sonnet4-5': 'Claude Sonnet 4.5',
  'sonnet-4-0': 'Claude Sonnet 4.5',
  sonnet46: 'Claude Sonnet 4.6',
  opus41: 'Claude Opus 4.1',
  'opus4-1': 'Claude Opus 4.6',
  opus47: 'Claude Opus 4.7',
  opus48: 'Claude Opus 4.8',
  grok4: 'Grok 4.2',
};

function modelDisplayName(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!hasRenderableValue(raw)) return '';
  const displayName = MODEL_DISPLAY_NAMES[raw.toLowerCase()] ?? raw;
  return displayName;
}

/**
 * True when an Instructions-component update changed only the model
 * (modelNameHint) and nothing else in the surfaced instruction fields — so the
 * change can be labelled "Model" instead of the broader "Instructions".
 */
function isModelOnlyInstructionsChange(before: string, after: string): boolean {
  const model = summarizeYamlDiff(before, after, MODEL_FIELDS);
  if (model.length === 0) return false;
  const all = instructionsRelevantDiff(before, after);
  // Copilot Studio changes the technical component kind from PreviewModels to
  // GptComponentMetadata when a model is selected. Treat that companion schema
  // migration as part of the model change instead of surfacing a "Kind" card.
  return all.every((change) => change.label === 'Model' || change.label === 'Kind');
}

/**
 * Capability fields that live on the Instructions component but are really agent
 * settings (web browsing, code interpreter, image input). Conversation starters
 * are also authored on this component but belong to Settings in the designer.
 * YAML fields are matched on the last path segment, case-insensitive — the same
 * convention as RELEVANT_FIELDS.
 */
const INSTRUCTION_SETTING_FIELDS = new Set([
  'aisettings.model.kind',
  'webbrowsing',
  'codeinterpreter',
  'imageinput',
]);

function instructionSettingsChanges(before: string, after: string): FriendlyChange[] {
  return [
    ...summarizeYamlDiff(before, after, INSTRUCTION_SETTING_FIELDS),
    ...conversationStarterChanges(before, after),
  ];
}

function instructionContentChanges(before: string, after: string): FriendlyChange[] {
  const settingLabels = new Set(instructionSettingsChanges(before, after).map((change) => change.label));
  return instructionsFriendlyChanges(before, after).filter((change) => !settingLabels.has(change.label));
}

/**
 * True when an Instructions-component update changed only capability settings
 * (web browsing / code interpreter / image input) and nothing else in the
 * surfaced instruction fields — so the change belongs to the "Settings" entity
 * rather than "Instructions".
 */
function isSettingsOnlyInstructionsChange(before: string, after: string): boolean {
  const settings = instructionSettingsChanges(before, after);
  if (settings.length === 0) return false;
  const all = instructionsRelevantDiff(before, after);
  return all.length === settings.length;
}

/** Convert the Knowledge category option into the maker-facing Official flag. */
function officialValue(category: string): string {
  return category.trim().toLowerCase() === 'authoritative' ? 'Yes' : 'No';
}

function isCategoryField(fieldName: string | undefined): boolean {
  return fieldName?.trim().toLowerCase() === 'category';
}

function isStateCodeField(fieldName: string | undefined): boolean {
  return fieldName?.trim().toLowerCase() === 'statecode';
}

function isAgentInstructionsField(fieldName: string | undefined): boolean {
  return fieldName?.trim().toLowerCase() === 'agentsettings.instructions';
}

function displayInstructionText(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function stateCodeDisplayValue(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return '';
  if (normalized === '0' || normalized === 'active' || normalized === 'enabled' || normalized === 'true') {
    return 'Enabled';
  }
  if (normalized === '1' || normalized === 'inactive' || normalized === 'disabled' || normalized === 'false') {
    return 'Disabled';
  }
  return value?.trim() ?? '';
}

function isSemanticallyUnchangedState(entry: ChangeLogEntry): boolean {
  if (!isStateCodeField(entry.fieldName)) return false;
  const before = stateCodeDisplayValue(entry.oldValue);
  const after = stateCodeDisplayValue(entry.newValue);
  return Boolean(before) && before === after;
}

function isSemanticallyUnchangedInstructions(entry: ChangeLogEntry): boolean {
  if (!isAgentInstructionsField(entry.fieldName)) return false;
  return displayInstructionText(entry.oldValue ?? '') === displayInstructionText(entry.newValue ?? '');
}

function isPublishedDateRollback(entry: ChangeLogEntry): boolean {
  if (entry.fieldName?.toLowerCase() !== 'publishedon' || !entry.oldValue || !entry.newValue) return false;
  const oldTime = parseDateTime(entry.oldValue);
  const newTime = parseDateTime(entry.newValue);
  return Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime;
}

/** Apply the Copilot Studio stale-published-date workaround to the agent summary. */
function effectivePublishedOn(publishedOn: string | undefined, entries: ChangeLogEntry[]): string | undefined {
  if (!publishedOn) return undefined;
  const publishedTime = parseDateTime(publishedOn);
  const rollback = entries
    .filter(
      (entry) =>
        isPublishedDateRollback(entry) &&
        entry.changedOn &&
        Number.isFinite(publishedTime) &&
        parseDateTime(entry.newValue ?? '') === publishedTime,
    )
    .sort((left, right) => parseDateTime(right.changedOn ?? '') - parseDateTime(left.changedOn ?? ''))[0];
  return rollback?.changedOn ?? publishedOn;
}

/**
 * Reduce a before/after pair to the friendly field changes a card should list,
 * plus a generic line-count `fallback` used when nothing meaningful survives.
 * Shared by {@link ChangeSummary} and its callers, so a card can tell whether a
 * summary is worth rendering before it commits to an introductory line.
 */
function friendlyChangesFor(
  before: string,
  after: string,
  componentType: ComponentType,
  fieldName?: string,
): { items: FriendlyChange[]; fallback: string } {
  const starters = conversationStarterChanges(before, after);
  if (starters.length > 0) return { items: starters, fallback: '' };
  if (isAgentInstructionsField(fieldName)) {
    return {
      items: summarizePlainTextChange(
        'instructions',
        displayInstructionText(before),
        displayInstructionText(after),
      ),
      fallback: '',
    };
  }
  if (
    componentType === ComponentType.Skill &&
    (firstYamlKind(after) === 'inlineagentskill' || firstYamlKind(before) === 'inlineagentskill')
  ) {
    const skillChanges = inlineSkillFriendlyChanges(before, after);
    if (skillChanges.length > 0) return { items: skillChanges, fallback: '' };
  }
  // Description is stored as plain text (not YAML), so summarise it directly
  // as a single field change instead of running the YAML flattener. The row
  // may carry the parent component's type (e.g. Knowledge) while still being a
  // description edit, so key off the field name as well as the legacy
  // Description component type.
  if (componentType === ComponentType.Description || fieldName === 'description') {
    return { items: summarizePlainTextChange('description', before, after), fallback: '' };
  }
  // A component's `name` row is plain text, not YAML. Running it through the
  // YAML flattener finds no `key: value` pair, yields no changes, and leaves
  // the card completely blank — which is what an agent rename used to look
  // like. Summarise it directly so the rename reads as before -> after.
  if (fieldName === 'name') {
    const nameKey = componentType === ComponentType.Instructions ? 'agentName' : 'name';
    return { items: summarizePlainTextChange(nameKey, before, after), fallback: '' };
  }
  // Knowledge category is a scalar botcomponent column that marks whether the
  // source is authoritative; it is not part of the component YAML.
  if (isCategoryField(fieldName)) {
    return {
      items: summarizePlainTextChange('official', officialValue(before), officialValue(after)),
      fallback: '',
    };
  }
  if (isStateCodeField(fieldName)) {
    const beforeStatus = stateCodeDisplayValue(before);
    const afterStatus = stateCodeDisplayValue(after);
    if (beforeStatus && beforeStatus === afterStatus) return { items: [], fallback: '' };
    const afterEnabled = afterStatus === 'Enabled';
    return {
      items: [{
        kind: before.trim() ? 'changed' : 'added',
        label: 'Status',
        before: beforeStatus || undefined,
        after: afterStatus || undefined,
        state: afterEnabled ? 'enabled' : 'disabled',
        text: `Status ${afterEnabled ? 'enabled' : 'disabled'}`,
      }],
      fallback: '',
    };
  }
  if (
    componentType === ComponentType.Evaluation &&
    (firstYamlKind(after) === 'evaluationset' || firstYamlKind(before) === 'evaluationset')
  ) {
    return { items: evaluationSetFriendlyChanges(before, after), fallback: '' };
  }
  const relevant = RELEVANT_FIELDS[componentType];
  const friendly = summarizeYamlDiff(
    before,
    after,
    relevant ? new Set(relevant) : undefined,
    componentType === ComponentType.Evaluation,
  );
  // The root agent (Instructions) component embeds the agent's display name;
  // suppress the phantom "Display name" add from older bodies that predate its
  // serialization so it doesn't masquerade as an edit (a real rename still
  // shows as a before -> after change).
  const surfaced =
    componentType === ComponentType.Instructions
      ? fieldName === INSTRUCTION_SETTINGS_FIELD
        ? instructionSettingsChanges(before, after)
        : fieldName === INSTRUCTION_CONTENT_FIELD
          ? instructionContentChanges(before, after)
          : instructionsFriendlyChanges(before, after)
      : firstYamlKind(after || before) === 'closedlistentity'
        ? closedListEntityFriendlyChanges(before, after)
      : settingsComponentTitle(after || before)
        ? normalizeSettingsComponentFields(friendly)
      : componentType === ComponentType.ChildAgent
        ? normalizeChildAgentFields(friendly)
      : componentType === ComponentType.Skill
        ? normalizeSkillFields(friendly)
      : componentType === ComponentType.Trigger
        ? normalizeTriggerFields(friendly)
      : componentType === ComponentType.MCP
        ? normalizeMcpDescriptions(friendly)
        : friendly;
  if (surfaced.length > 0) return { items: surfaced, fallback: '' };
  // Nothing interpretable survived. A bare line count is only worth showing when
  // there was real structured YAML to count — then it honestly says "something
  // changed in here, open View YAML". When neither side is YAML (plain prose, a
  // single sentence recovered from a name/description history row, or an empty
  // payload) there is nothing to show at all, so emit no fallback and let the
  // caller drop the whole block rather than promise detail it cannot deliver.
  if (!hasYamlContent(before) && !hasYamlContent(after)) return { items: [], fallback: '' };
  const s = diffSummary(diffLines(before, after));
  return { items: [], fallback: diffSummaryText(s.added, s.removed) };
}

/**
 * Plain-English summary of what changed in a component, derived from its YAML.
 * Falls back to a generic line-count sentence when nothing is interpretable.
 */
function changedTextSides(before: string | undefined, after: string | undefined): {
  before: string;
  after: string;
} {
  const lines = diffLines(before ?? '', after ?? '');
  return {
    before: lines
      .filter((line) => line.type === 'remove')
      .map((line) => line.text)
      .join('\n'),
    after: lines
      .filter((line) => line.type === 'add')
      .map((line) => line.text)
      .join('\n'),
  };
}

function ChangeSummary({
  before,
  after,
  componentType,
  changeType,
  fieldName,
}: {
  before: string;
  after: string;
  componentType: ComponentType;
  changeType?: ChangeType;
  fieldName?: string;
}) {
  const styles = useStyles();
  const { items, fallback } = useMemo(
    () => friendlyChangesFor(before, after, componentType, fieldName),
    [before, after, componentType, fieldName],
  );

  if (items.length === 0) {
    // No interpretable fields and no meaningful count — render nothing rather
    // than an empty caption that leaves a dangling introduction above it.
    if (!fallback) return null;
    return <Caption1 className={styles.diffSummaryText}>{fallback}</Caption1>;
  }

  const shown = changeType === ChangeType.Deleted ? items : items.slice(0, MAX_INLINE_CHANGES);
  const more = items.length - shown.length;
  const typeLabel = componentTypeLabel(componentType);

  return (
    <div className={styles.changeList}>
      {shown.map((c, idx) => {
        const divider = idx > 0 ? styles.propRowDivider : '';
        // On a component that already existed (parent card is "Updated"), a
        // long-text prose field appearing from empty is an edit to that
        // component, not a brand-new addition — so its badge mirrors the card
        // ("Updated") instead of contradicting it with "Added".
        const badgeKind =
          changeType === ChangeType.Updated && c.longText && c.kind === 'added' ? 'changed' : c.kind;
        const changedText =
          changeType === ChangeType.Updated && c.longText
            ? changedTextSides(c.before, c.after)
            : undefined;
        const hasChangedBefore = hasRenderableValue(changedText?.before);
        const hasChangedAfter = hasRenderableValue(changedText?.after);
        // When the whole component was added or removed, every field inside it
        // trivially shares that fate and the card header already says so, so a
        // per-field badge is pure noise. Only an "Updated" card has a genuine
        // per-field mix worth labelling.
        const showBadge = changeType !== ChangeType.Created && changeType !== ChangeType.Deleted;
        return c.longText ? (
          <div key={idx} className={`${styles.propRowLong} ${divider}`}>
            {c.label.toLowerCase() !== typeLabel.toLowerCase() && (
              <div className={styles.propLongHead}>
                <Body1 className={styles.summaryLabel}>{c.label}</Body1>
                {showBadge && (
                  <Badge
                    appearance="tint"
                    color={badgeKind === 'added' ? 'success' : badgeKind === 'removed' ? 'danger' : 'warning'}
                  >
                    {badgeKind === 'added' ? 'Added' : badgeKind === 'removed' ? 'Removed' : 'Updated'}
                  </Badge>
                )}
              </div>
            )}
            <div
              className={
                changeType === ChangeType.Updated
                  ? mergeClasses(
                      styles.propLongUpdate,
                      (!hasChangedBefore || !hasChangedAfter) && styles.propLongUpdateSingle,
                    )
                  : styles.propLongBody
              }
            >
              {changeType === ChangeType.Updated ? (
                <>
                  {hasChangedBefore && (
                    <div className={`${styles.longTextBlock} ${styles.longTextBefore}`}>
                      {changedText.before}
                    </div>
                  )}
                  {hasChangedBefore && hasChangedAfter && (
                    <ArrowRightRegular className={styles.arrow} />
                  )}
                  {hasChangedAfter && (
                    <div className={`${styles.longTextBlock} ${styles.longTextAfter}`}>
                      {changedText.after}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {(c.kind === 'changed' || c.kind === 'removed') && c.before ? (
                    <div className={`${styles.longTextBlock} ${styles.longTextBefore}`}>{c.before}</div>
                  ) : null}
                  {c.kind !== 'removed' && c.after ? (
                    <div className={`${styles.longTextBlock} ${styles.longTextAfter}`}>{c.after}</div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <div key={idx} className={`${styles.propRow} ${divider}`}>
            <div className={styles.propLabel}>{c.label}</div>
            <div className={styles.propValue}>
              {changeType === ChangeType.Updated ? (
                <>
                  {hasRenderableValue(c.before) && <span className={styles.beforeToken}>{c.before}</span>}
                  {hasRenderableValue(c.before) && hasRenderableValue(c.after) && (
                    <ArrowRightRegular className={styles.tokenArrow} />
                  )}
                  {hasRenderableValue(c.after) && <span className={styles.afterToken}>{c.after}</span>}
                </>
              ) : c.state ? (
                <span className={c.kind === 'removed' ? styles.beforeToken : styles.afterToken}>
                  {c.kind === 'removed' ? (c.before ?? 'Disabled') : (c.after ?? (c.state === 'enabled' ? 'Enabled' : 'Disabled'))}
                </span>
              ) : c.before !== undefined && c.after !== undefined ? (
                <>
                  <span className={styles.beforeToken}>{c.before}</span>
                  <ArrowRightRegular className={styles.tokenArrow} />
                  <span className={styles.afterToken}>{c.after}</span>
                </>
              ) : c.after !== undefined ? (
                <span className={styles.afterToken}>{c.after}</span>
              ) : c.before !== undefined ? (
                <>
                  <span className={styles.beforeToken}>{c.before}</span>
                  {changeType !== ChangeType.Deleted && (
                    <Body1 className={styles.verbText}>{c.verb ?? 'removed'}</Body1>
                  )}
                </>
              ) : (
                <Body1 className={styles.verbText}>{c.verb ?? 'changed'}</Body1>
              )}
            </div>
          </div>
        );
      })}
      {more > 0 && (
        <div className={styles.propMoreRow}>
          <Caption1 className={styles.changeMore}>
            +{more} more {more === 1 ? 'change' : 'changes'}
          </Caption1>
        </div>
      )}
    </div>
  );
}

/**
 * Render a secondary-languages change as a delta: green "+ <language>" chips for
 * languages added and red "\u2212 <language>" chips for languages removed. Secondary
 * languages are a set, so a before\u2192after replacement misreads an add as a swap.
 */
function SecondaryLanguageDelta({ before, after }: { before: string; after: string }) {
  const styles = useStyles();
  const b = supportedLanguageValues(before);
  const a = supportedLanguageValues(after);
  const added = a.filter((x) => !b.includes(x));
  const removed = b.filter((x) => !a.includes(x));

  if (added.length === 0 && removed.length === 0) {
    return a.length > 0 ? <span className={`${styles.pill} ${styles.afterBox}`}>{a.join('; ')}</span> : null;
  }

  return (
    <div className={styles.inlineDiff}>
      {added.map((lang) => (
        <span key={`add-${lang}`} className={`${styles.pill} ${styles.afterBox}`}>{`+ ${lang}`}</span>
      ))}
      {removed.map((lang) => (
        <span key={`rem-${lang}`} className={`${styles.pill} ${styles.beforeBox}`}>{`\u2212 ${lang}`}</span>
      ))}
    </div>
  );
}

/**
 * Render a channels change as a delta: green "+ <channel>" chips for channels
 * added and red "\u2212 <channel>" chips for channels removed. Channels are a set
 * (configuration.channels), so a before\u2192after replacement misreads adding a
 * channel as removing the ones that were already enabled.
 */
function ChannelDelta({ before, after }: { before: string; after: string }) {
  const styles = useStyles();
  const split = (s: string) =>
    s
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean);
  const b = split(before);
  const a = split(after);
  const added = a.filter((x) => !b.includes(x));
  const removed = b.filter((x) => !a.includes(x));

  if (added.length === 0 && removed.length === 0) {
    return a.length > 0 ? (
      <span className={`${styles.pill} ${styles.afterBox}`}>
        {a.map(channelLabel).join(', ')}
      </span>
    ) : null;
  }

  return (
    <div className={styles.inlineDiff}>
      {added.map((ch) => (
        <span key={`add-${ch}`} className={`${styles.pill} ${styles.afterBox}`}>{`+ ${channelLabel(ch)}`}</span>
      ))}
      {removed.map((ch) => (
        <span key={`rem-${ch}`} className={`${styles.pill} ${styles.beforeBox}`}>{`\u2212 ${channelLabel(ch)}`}</span>
      ))}
    </div>
  );
}

const ChangeRow = memo(function ChangeRow({
  entry,
  version,
  orgUrl,
  localPreview,
  childAgentName,
}: {
  entry: ChangeLogEntry;
  version?: string;
  orgUrl?: string;
  localPreview: boolean;
  childAgentName?: string;
}) {
  const styles = useStyles();
  const [yamlOpen, setYamlOpen] = useState(false);
  const componentType = refineComponentType(
    (entry.componentType ?? ComponentType.Other) as ComponentType,
    classificationBody(entry),
  );
  const isCreated = entry.changeType === ChangeType.Created;
  const isDeleted = entry.changeType === ChangeType.Deleted;
  const isUpdated = entry.changeType === ChangeType.Updated;
  const isAgentDeleted =
    isDeleted &&
    entry.componentType === ComponentType.Agent &&
    entry.sourceTable === SourceTable.Agent;
  // A model swap and a capability toggle (web browsing / code interpreter /
  // image input) both live on the Instructions component but are really agent
  // settings, so when only those changed the card reads as "Settings".
  // "Published on" is an agent-level publish event captured as a Settings row
  // but reads as "Other". This is the same categorisation the component-type
  // filter matches on (displayComponentType).
  const displayType = displayComponentType(entry);
  // A model swap is authored on the Instructions component but reads as an agent
  // setting, so it renders with the same structure as Agent name / Icon / Voice
  // settings: a "Model" title under the Settings category, a before -> after
  // pill pair, and no YAML view.
  const isModelCard = isModelChange(entry);
  const componentLabel = isModelCard
    ? COMPONENT_TYPE_LABEL[ComponentType.Settings]
    : componentLabelFor(displayType, classificationBody(entry));
  const isSetting =
    isScalarComponentType(componentType) || entry.componentName === SUGGESTED_PROMPTS_LABEL;
  const isIconSetting = isSetting && entry.componentName === ICON_SETTING_LABEL;
  const structuredSettingsTitle = settingsComponentTitle(entry.newValue || entry.oldValue);
  const evaluationSetTitle =
    componentType === ComponentType.Evaluation &&
    firstYamlKind(entry.newValue || entry.oldValue) === 'evaluationset'
      ? evaluationSetDetails(entry.newValue || entry.oldValue || '').displayName
      : undefined;
  const componentTitle = isModelCard
    ? MODEL_LABEL
    : isCategoryField(entry.fieldName)
      ? 'Official'
      : evaluationSetTitle
        ? evaluationSetTitle
      : structuredSettingsTitle
        ? structuredSettingsTitle
        : settingDisplayName(entry);
  const categorySourceName = isCategoryField(entry.fieldName) ? entry.componentName?.trim() : undefined;
  const beforeIcon = isIconSetting ? iconDataUri(entry.oldValue) : null;
  const afterIcon = isIconSetting ? iconDataUri(entry.newValue) : null;

  const before = entry.oldValue ?? '';
  const after = entry.newValue ?? '';
  const createdDescription = isCreated ? entry.componentDescription?.trim() ?? '' : '';
  const feedbackBefore = feedbackCollectionValue(entry.oldValue);
  const feedbackAfter = feedbackCollectionValue(entry.newValue);
  const isFeedbackCollection = feedbackBefore !== undefined || feedbackAfter !== undefined;
  const hasFeedbackStatusChange = feedbackBefore !== feedbackAfter;
  const feedbackDisclaimer = isFeedbackCollection
    ? summarizeYamlDiff(before, after, new Set(['disclaimer']))[0]
    : undefined;
  // The model card's stored values are the whole Instructions YAML body, so pull
  // the two model names out to render them as plain before/after pills.
  const modelDelta = isModelCard ? summarizeYamlDiff(before, after, MODEL_FIELDS)[0] : undefined;
  const modelBefore = modelDisplayName(modelDelta?.before);
  const modelAfter = modelDisplayName(modelDelta?.after);
  // Copilot Studio product bug: some saves regress `publishedon` to an older
  // timestamp. Keep the history row, but present the save's `changedOn` time as
  // the effective new publication time instead of displaying the stale value.
  const publishedDateRolledBack = isPublishedDateRollback(entry);
  const displaySettingValue = (value: string | undefined, isNewValue = false) => {
    if (!hasRenderableValue(value)) return '';
    if (componentTitle === MODEL_LABEL) return modelDisplayName(value);
    if (entry.fieldName?.toLowerCase() === 'publishedon' && value) {
      return formatDateTime(isNewValue && publishedDateRolledBack && entry.changedOn ? entry.changedOn : value);
    }
    return botChoiceValue(entry.fieldName, value);
  };
  const displayedOldValue = displaySettingValue(entry.oldValue);
  const displayedNewValue = displaySettingValue(entry.newValue, true);
  const hasConversationStarterChanges = conversationStarterChanges(before, after).length > 0;
  const isStructuredSetting = Boolean(structuredSettingsTitle);
  const renderAsSetting = (isSetting || isModelCard) && !isStructuredSetting && !hasConversationStarterChanges;
  const hasYaml = !renderAsSetting && (before.length > 0 || after.length > 0);
  // Description and name are plain prose, not YAML — the inline block already
  // shows the full before/after, and a line-diff would wrongly strike the whole
  // previous value as "removed", so suppress the YAML view for them.
  const isPlainTextField =
    entry.fieldName === 'description' ||
    entry.fieldName === 'name' ||
    isAgentInstructionsField(entry.fieldName) ||
    isCategoryField(entry.fieldName) ||
    isStateCodeField(entry.fieldName) ||
    componentType === ComponentType.Description;
  // A removal has no "after" side, so the dialog would only ever render the old
  // YAML against an empty pane. The inline block already states what was removed.
  const canViewYaml = !renderAsSetting && !isStructuredSetting && !isPlainTextField && !isDeleted;

  // Whether a creation's body actually produces readable field rows, as opposed
  // to only a raw line count.
  const createdHasDetail = useMemo(
    () => (isCreated ? friendlyChangesFor('', after, componentType, entry.fieldName).items.length > 0 : false),
    [isCreated, after, componentType, entry.fieldName],
  );

  // Whether a removal has anything at all to show beneath its introduction —
  // either readable field rows or a meaningful line count. A recovered body that
  // is plain prose (or empty) yields neither, so the "It previously contained:"
  // lead-in would head an empty block.
  const deletedHasDetail = useMemo(() => {
    if (!isDeleted) return false;
    const { items, fallback } = friendlyChangesFor(before, '', componentType, entry.fieldName);
    return items.length > 0 || fallback !== '';
  }, [isDeleted, before, componentType, entry.fieldName]);

  const accentClass = isCreated ? styles.accentAdded : isDeleted ? styles.accentRemoved : styles.accentUpdated;

  return (
    <div className={styles.row}>
      <div className={`${styles.rowAccent} ${accentClass}`} />
      <div className={styles.rowBody}>
        <div className={styles.rowMeta}>
          <Badge appearance="tint" color={changeTypeColor(entry.changeType)}>
            {isAgentDeleted
              ? 'Deleted'
              : entry.changeType !== undefined
                ? CHANGE_TYPE_LABEL[entry.changeType]
                : 'Changed'}
          </Badge>
          <Body1Strong>{componentTitle || componentLabel}</Body1Strong>
          {categorySourceName && <Caption1 className={styles.fieldName}>· {categorySourceName}</Caption1>}
          <Caption1 className={styles.fieldName}>· {componentLabel}</Caption1>
          {childAgentName && (
            <Caption1 className={styles.fieldName}>· {COMPONENT_TYPE_LABEL[ComponentType.ChildAgent]}</Caption1>
          )}
        </div>

        {isAgentDeleted ? (
          <Caption1 className={styles.componentNote}>This agent has been deleted.</Caption1>
        ) : renderAsSetting ? (
          isModelCard ? (
            <div className={styles.inlineDiff}>
              {modelBefore && <span className={`${styles.pill} ${styles.beforeBox}`}>{modelBefore}</span>}
              {modelBefore && modelAfter && <ArrowRightRegular className={styles.arrow} />}
              {modelAfter && <span className={`${styles.pill} ${styles.afterBox}`}>{modelAfter}</span>}
            </div>
          ) : isFeedbackCollection ? (
            <div className={styles.changeList}>
              {hasFeedbackStatusChange && (
                <div className={mergeClasses(styles.propRow, styles.propRowCompact)}>
                  <div className={styles.propLabel}>Status</div>
                  <div className={styles.propValue}>
                    {feedbackBefore && <span className={styles.beforeToken}>{feedbackBefore}</span>}
                    {feedbackBefore && feedbackAfter && <ArrowRightRegular className={styles.tokenArrow} />}
                    {feedbackAfter && <span className={styles.afterToken}>{feedbackAfter}</span>}
                  </div>
                </div>
              )}
              {feedbackDisclaimer && (
                <div className={mergeClasses(styles.propRow, hasFeedbackStatusChange && styles.propRowDivider)}>
                  <div className={styles.propLabel}>Disclaimer</div>
                  <div className={styles.propValue}>
                    {feedbackDisclaimer.before && (
                      <span className={styles.beforeToken}>{feedbackDisclaimer.before}</span>
                    )}
                    {feedbackDisclaimer.before && feedbackDisclaimer.after && (
                      <ArrowRightRegular className={styles.tokenArrow} />
                    )}
                    {feedbackDisclaimer.after && (
                      <span className={styles.afterToken}>{feedbackDisclaimer.after}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : entry.componentName === SECONDARY_LANGUAGES_LABEL || entry.fieldName?.toLowerCase() === 'supportedlanguages' ? (
            <SecondaryLanguageDelta before={entry.oldValue ?? ''} after={entry.newValue ?? ''} />
          ) : entry.componentName === CHANNELS_LABEL ? (
            <ChannelDelta before={entry.oldValue ?? ''} after={entry.newValue ?? ''} />
          ) : isIconSetting ? (
            beforeIcon || afterIcon ? (
              <div className={styles.iconDiff}>
                {isUpdated ? (
                  <>
                    {beforeIcon && (
                      <figure className={styles.iconFigure}>
                        <img className={styles.iconThumb} src={beforeIcon} alt="Previous agent icon" />
                        <Caption1>Before</Caption1>
                      </figure>
                    )}
                    {beforeIcon && afterIcon && <ArrowRightRegular className={styles.arrow} />}
                    {afterIcon && (
                      <figure className={styles.iconFigure}>
                        <img className={styles.iconThumb} src={afterIcon} alt="New agent icon" />
                        <Caption1>After</Caption1>
                      </figure>
                    )}
                  </>
                ) : isCreated ? (
                  afterIcon && (
                    <figure className={styles.iconFigure}>
                      <img className={styles.iconThumb} src={afterIcon} alt="Agent icon" />
                      <Caption1>Icon set</Caption1>
                    </figure>
                  )
                ) : (
                  beforeIcon && (
                    <figure className={styles.iconFigure}>
                      <img className={styles.iconThumb} src={beforeIcon} alt="Removed agent icon" />
                      <Caption1>Icon removed</Caption1>
                    </figure>
                  )
                )}
              </div>
            ) : (
              <Caption1 className={styles.componentNote}>
                {isUpdated ? 'Icon image updated.' : isCreated ? 'Icon image set.' : 'Icon image removed.'}
              </Caption1>
            )
          ) : isUpdated ? (
            <div className={styles.inlineDiff}>
              {displayedOldValue && (
                <span className={`${styles.pill} ${styles.beforeBox}`}>{displayedOldValue}</span>
              )}
              {displayedOldValue && displayedNewValue && <ArrowRightRegular className={styles.arrow} />}
              {displayedNewValue && (
                <span className={`${styles.pill} ${styles.afterBox}`}>{displayedNewValue}</span>
              )}
            </div>
          ) : isCreated ? (
            displayedNewValue ? (
              <div className={styles.valueCol}>
                <Caption1>Set to</Caption1>
                <span className={`${styles.pill} ${styles.afterBox}`}>{displayedNewValue}</span>
              </div>
            ) : null
          ) : displayedOldValue ? (
            <div className={styles.valueCol}>
              <span className={`${styles.pill} ${styles.beforeBox}`}>{displayedOldValue}</span>
            </div>
          ) : null
        ) : (
          <div className={styles.changePanel}>
            {isUpdated && hasYaml ? (
              <ChangeSummary
                before={before}
                after={after}
                componentType={componentType}
                changeType={entry.changeType}
                fieldName={entry.fieldName}
              />
            ) : isCreated ? (
              // A creation whose body yields no readable field summary would
              // otherwise render an introduction promising "the following
              // configuration" followed by nothing but a raw line count. The
              // card header already names what was added and "View YAML" holds
              // the detail, so say nothing rather than say nothing usefully.
              after.length > 0 && (createdDescription || createdHasDetail) ? (
                <>
                  {!hasConversationStarterChanges && (
                    <Caption1 className={styles.componentNote}>
                      {`New ${sentenceNoun(componentLabel)} added with the following configuration:`}
                    </Caption1>
                  )}
                  {createdDescription && (
                    <div className={styles.changeList}>
                      <div className={styles.propRowLong}>
                        <div className={styles.propLongHead}>
                          <Body1 className={styles.summaryLabel}>Description</Body1>
                        </div>
                        <div className={styles.propLongBody}>
                          <div className={`${styles.longTextBlock} ${styles.longTextAfter}`}>
                            {createdDescription}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {createdHasDetail && (
                    <ChangeSummary
                      before=""
                      after={after}
                      componentType={componentType}
                      changeType={entry.changeType}
                      fieldName={entry.fieldName}
                    />
                  )}
                </>
              ) : after.length > 0 && canViewYaml ? null : (
                <Caption1 className={styles.componentNote}>
                  {`This ${sentenceNoun(componentLabel)} was added.`}
                </Caption1>
              )
            ) : isDeleted ? (
              // Only promise "It previously contained:" when something actually
              // follows it. A body the app cannot describe (plain prose, or a
              // sentence recovered from a name/description history row) leaves
              // the lead-in heading an empty block, so state the removal plainly.
              before.length > 0 && deletedHasDetail ? (
                <>
                  <Caption1 className={styles.componentNote}>
                    This {sentenceNoun(componentLabel)} was removed. It previously contained:
                  </Caption1>
                  <ChangeSummary
                    before={before}
                    after=""
                    componentType={componentType}
                    changeType={entry.changeType}
                    fieldName={entry.fieldName}
                  />
                </>
              ) : (
                <Caption1 className={styles.componentNote}>This {sentenceNoun(componentLabel)} was removed.</Caption1>
              )
            ) : null}
            {canViewYaml && (
              <div className={styles.panelFooter}>
                <Button size="small" appearance="subtle" icon={<CodeRegular />} onClick={() => setYamlOpen(true)}>
                  View YAML
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {canViewYaml && (
        <YamlDialog
          entry={entry}
          version={version}
          orgUrl={orgUrl}
          localPreview={localPreview}
          open={yamlOpen}
          onOpenChange={setYamlOpen}
        />
      )}
    </div>
  );
});

/** Compact count of change kinds for a save group's collapsed header. */
function GroupMix({ entries }: { entries: ChangeLogEntry[] }) {
  const styles = useStyles();
  const mix = useMemo(
    () => ({
      added: entries.filter((e) => e.changeType === ChangeType.Created).length,
      updated: entries.filter((e) => e.changeType === ChangeType.Updated).length,
      removed: entries.filter((e) => e.changeType === ChangeType.Deleted).length,
    }),
    [entries],
  );
  return (
    <span className={styles.mixChips}>
      {mix.added > 0 && (
        <span className={`${styles.mixChip} ${styles.mixAdded}`}>
          <span className={`${styles.mixDot} ${styles.mixDotAdded}`} />
          {mix.added}
        </span>
      )}
      {mix.updated > 0 && (
        <span className={`${styles.mixChip} ${styles.mixUpdated}`}>
          <span className={`${styles.mixDot} ${styles.mixDotUpdated}`} />
          {mix.updated}
        </span>
      )}
      {mix.removed > 0 && (
        <span className={`${styles.mixChip} ${styles.mixRemoved}`}>
          <span className={`${styles.mixDot} ${styles.mixDotRemoved}`} />
          {mix.removed}
        </span>
      )}
    </span>
  );
}

/**
 * The tracked baseline — the agent's complete state the moment it was
 * configured — is stored in the database (the config's snapshot blob), NOT in
 * the change log, so it never shows on the timeline. Every row here is a real
 * change captured against that snapshot: a changed model, an added tool, a
 * removed topic.
 */
interface ChangeTimelineProps {
  agent: TrackingConfig | undefined;
}

/** Time-window options for the date filter. */
type DateFilter = '30m' | '1d' | '7d' | '30d' | 'custom';

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  '30m': 'Last 30 mins',
  '1d': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

/** Window length in days. Sub-day ranges use fractions of a day. */
const DATE_FILTER_DAYS: Record<Exclude<DateFilter, 'custom'>, number> = {
  '30m': 30 / (60 * 24),
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

const DEFAULT_DATE_FILTER: DateFilter = '30d';

/**
 * A UI-only classification key. It is currently just {@link ComponentType}, but
 * stays a distinct alias because a change is not always presented as the type it
 * is stored as — see {@link displayComponentType}.
 */
export type DisplayType = ComponentType;

/** Card title for a model swap, which is stored on the Instructions component. */
const MODEL_LABEL = 'Model';

/** The "Published on" agent-level publish event, captured as a Settings row. */
const PUBLISHED_SETTING_LABEL = 'Published on';

/**
 * The category a change is actually presented as on its card — the single
 * source of truth the component-type filter matches against, so a card never
 * appears under a type the reader can't see on it:
 *  - YAML `kind` refinement (e.g. a knowledge source Dataverse typed as Other);
 *  - "Published on" is an agent-level publish event, so it reads as Agent
 *    rather than its stored Settings type;
 *  - an Instructions update that only swapped the model, or only toggled a
 *    capability (web browsing, code interpreter, image input), reads as
 *    Settings — both are agent settings authored on the Instructions component.
 */
function displayComponentType(e: ChangeLogEntry): DisplayType {
  if (isCategoryField(e.fieldName)) return ComponentType.Knowledge;
  if (isAgentInstructionsField(e.fieldName)) return ComponentType.Instructions;
  if (e.fieldName === INSTRUCTION_SETTINGS_FIELD) return ComponentType.Settings;
  if (e.fieldName === INSTRUCTION_CONTENT_FIELD) return ComponentType.Instructions;
  if (e.componentName === SUGGESTED_PROMPTS_LABEL) return ComponentType.Settings;
  const base = refineComponentType(
    (e.componentType ?? ComponentType.Other) as ComponentType,
    classificationBody(e),
  );
  if (isScalarComponentType(base) && e.componentName === PUBLISHED_SETTING_LABEL) {
    return ComponentType.Agent;
  }
  if (base === ComponentType.Instructions && e.changeType === ChangeType.Updated) {
    const before = e.oldValue ?? '';
    const after = e.newValue ?? '';
    if (isModelOnlyInstructionsChange(before, after) || isSettingsOnlyInstructionsChange(before, after)) {
      return ComponentType.Settings;
    }
  }
  return base;
}

/**
 * Whether a change is a model swap: stored on the Instructions component, but
 * presented as a "Model" setting card with before → after pills.
 */
function isModelChange(e: ChangeLogEntry): boolean {
  const base = refineComponentType(
    (e.componentType ?? ComponentType.Other) as ComponentType,
    classificationBody(e),
  );
  if (base !== ComponentType.Instructions || e.changeType !== ChangeType.Updated) return false;
  return isModelOnlyInstructionsChange(e.oldValue ?? '', e.newValue ?? '');
}

/** Human-readable label for a {@link DisplayType}. */
function displayTypeLabel(t: DisplayType): string {
  return componentTypeLabel(t);
}

/**
 * Restore the authored YAML body on deletion rows that lost it.
 *
 * When a component is deleted the row no longer exists to read, so the capture
 * flow recovers the component's last known body from history — but it does not
 * restrict that lookup to the `data` field, so it can pick up a `name` or
 * `description` row and store that plain text as the deletion's old value. The
 * authored YAML is then gone, and with it the only authoritative signal for the
 * component's real type: `kind: InlineAgentSkill`, `MultiTurnEvaluationCase`,
 * `ConnectedAgentTool` and friends are what {@link refineComponentType} relabels
 * on. Without it the row keeps the capture flow's fallback type and the card
 * reads "Other" with no configuration to show.
 *
 * The same component's earlier rows are already loaded in this change log, so
 * the last body it actually had is recovered here. Only rows that carry no YAML
 * at all are touched, so a deletion the flow captured correctly is left alone.
 */
function recoverDeletedBodies(entries: ChangeLogEntry[]): ChangeLogEntry[] {
  const bodyByComponent = new Map<string, string>();
  // Entries arrive newest first; walk oldest first so the newest body wins.
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (!e.componentId || e.changeType === ChangeType.Deleted) continue;
    const body = e.newValue || e.oldValue || '';
    if (firstYamlKind(body)) bodyByComponent.set(e.componentId, body);
  }
  return entries.map((e) => {
    if (e.changeType !== ChangeType.Deleted || !e.componentId || isCategoryField(e.fieldName)) return e;
    if (firstYamlKind(e.oldValue)) return e;
    const recovered = bodyByComponent.get(e.componentId);
    return recovered ? { ...e, oldValue: recovered } : e;
  });
}

/** Split mixed instruction/capability updates into two cards in the same save group. */
function splitInstructionSettings(entries: ChangeLogEntry[]): ChangeLogEntry[] {
  return entries.flatMap((entry) => {
    if (entry.changeType !== ChangeType.Updated) return [entry];
    const type = refineComponentType(
      (entry.componentType ?? ComponentType.Other) as ComponentType,
      classificationBody(entry),
    );
    if (type !== ComponentType.Instructions) return [entry];
    const before = entry.oldValue ?? '';
    const after = entry.newValue ?? '';
    if (instructionSettingsChanges(before, after).length === 0 || instructionContentChanges(before, after).length === 0) {
      return [entry];
    }
    return [
      { ...entry, id: `${entry.id}:content`, fieldName: INSTRUCTION_CONTENT_FIELD },
      { ...entry, id: `${entry.id}:settings`, fieldName: INSTRUCTION_SETTINGS_FIELD },
    ];
  });
}

/** Right pane: change history for the selected agent, grouped by Save. */
export function ChangeTimeline({ agent }: ChangeTimelineProps) {
  const styles = useStyles();
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const { data: entries, isLoading, isFetching, refetch } = useAgentChangeLog(
    agent?.agentId,
    agent?.environmentId,
    agent?.id,
  );
  const { data: componentParents } = useAgentComponentParents(agent?.agentId, agent?.environmentUrl);
  const { data: componentBodies } = useComponentBodies(agent?.id);
  const { data: isLocalPreview } = useLocalPreviewMode();

  const { data: centralMetadata } = useCentralAgentMetadata(agent?.id);
  const { data: trackable } = useTrackableAgents();
  const catalogAgent = useMemo(() => {
    if (!agent) return undefined;
    return (trackable ?? []).find(
      (candidate) =>
        candidate.agentId === agent.agentId &&
        (candidate.environmentId ?? '') === (agent.environmentId ?? ''),
    );
  }, [agent, trackable]);
  const { data: botOwnership } = useAgentOwnership(
    agent?.agentId,
    agent?.environmentUrl,
    Boolean(trackable && agent?.environmentUrl && !catalogAgent?.ownerName),
  );
  const ownerName = catalogAgent?.ownerName ?? botOwnership?.ownerName;
  const publishedOn = centralMetadata?.publishedOn ?? catalogAgent?.publishedOn;
  const displayedPublishedOn = useMemo(
    () => effectivePublishedOn(publishedOn, entries ?? []),
    [publishedOn, entries],
  );

  const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType[]>([]);
  const [componentTypeFilter, setComponentTypeFilter] = useState<DisplayType[]>([]);
  const [changedByFilter, setChangedByFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  // Captured once per mount; refreshed whenever the user picks a window. Calling
  // Date.now() during render is impure and would drift on unrelated re-renders.
  const [mountNow] = useState(() => Date.now());
  const retention = useMemo(() => retentionWindow(mountNow), [mountNow]);
  const retentionDates = useMemo(() => retentionWindowDates(mountNow), [mountNow]);
  const [dateReference, setDateReference] = useState<number | null>(null);
  /** Inclusive custom range (yyyy-mm-dd), used when `dateFilter` is 'custom'. */
  const [customRange, setCustomRange] = useState<CustomRange>(() => emptyCustomRange());
  // Edited copy shown in the dialog. Keeping it separate is what makes Cancel
  // work: the applied filter is only replaced when Apply is pressed.
  const [draftRange, setDraftRange] = useState<CustomRange>(() => emptyCustomRange());
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'summary'>('history');

  // Copilot Studio's host varies per cloud, so the deep link is resolved
  // asynchronously from configuration rather than assembled inline. The result
  // is stamped with the agent it belongs to so a pending resolve for a previous
  // selection can never surface against the agent now on screen.
  const [studio, setStudio] = useState<{ agentId?: string; url: string | null }>({ url: null });
  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    buildCopilotStudioAgentUrl(agent)
      .then((url) => {
        if (!cancelled) setStudio({ agentId: agent.agentId, url });
      })
      .catch(() => {
        if (!cancelled) setStudio({ agentId: agent.agentId, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [agent]);
  const studioUrl = agent && studio.agentId === agent.agentId ? studio.url : null;

  // Reset filters when switching agents (React's "adjust state during render"
  // pattern) so a stale selection from a previous agent doesn't hide everything.
  const [prevAgentId, setPrevAgentId] = useState(agent?.agentId);
  if (agent?.agentId !== prevAgentId) {
    setPrevAgentId(agent?.agentId);
    setChangeTypeFilter([]);
    setComponentTypeFilter([]);
    setChangedByFilter([]);
    setDateFilter(DEFAULT_DATE_FILTER);
    setDateReference(null);
    setCustomRange(emptyCustomRange());
  }

  const applyDateFilter = (value: DateFilter) => {
    if (value === 'custom') {
      // Open the editor without changing the active filter — picking "Custom
      // range" from the menu is not itself a commitment, so Cancel can leave
      // the current filter untouched.
      setDraftRange((current) =>
        isCustomRangeComplete(customRange)
          ? customRange
          : isCustomRangeComplete(current)
            ? current
            : defaultCustomRange(Date.now()),
      );
      setCustomRangeOpen(true);
      return;
    }
    setDateFilter(value);
    setDateReference(Date.now());
  };

  const commitCustomRange = () => {
    setCustomRange(draftRange);
    setDateFilter('custom');
    setDateReference(Date.now());
    setCustomRangeOpen(false);
  };

  const groups = useMemo(() => {
    const classifiedEntries = (entries ?? [])
      .filter(
        (entry) =>
          !isSemanticallyUnchangedState(entry) &&
          !isSemanticallyUnchangedInstructions(entry),
      )
      .map((entry) => {
        if (!entry.componentId || firstYamlKind(entry.oldValue) || firstYamlKind(entry.newValue)) return entry;
        const body = componentBodies?.[entry.componentId];
        return body ? { ...entry, classificationBody: body } : entry;
      });
    return collapseInstructionSettingCompanions(
      collapseSkillDescriptionCompanions(
        collapseDuplicateComponentPayloads(
          collapseStateDataCompanions(
            collapseAgentRenameCompanions(
              cleanSaveGroups(
                groupBySaveTransaction(splitInstructionSettings(recoverDeletedBodies(classifiedEntries))),
              ),
            ),
          ),
        ),
      ),
    );
  }, [entries, componentBodies]);

  // Solution-style versioning: every recorded save (transaction) bumps the
  // revision — 1.0.0.1, 1.0.0.2, … — oldest first, so the agent carries one
  // monotonically increasing version per change, like a Power Platform solution.
  // The baseline is 1.0.0.0 and lives in the database, so the first real edit
  // shown here is 1.0.0.1.
  const versionByGroup = useMemo(() => {
    const ordered = [...groups].sort(compareSaveGroups);
    const out = new Map<string, string>();
    let rev = 0;
    for (const g of ordered) {
      rev += 1;
      out.set(g.saveTransactionId, `1.0.0.${rev}`);
    }
    return out;
  }, [groups]);

  // Distinct component types present in this agent's history (Settings,
  // Instructions, Tools, Skills, Knowledge, …), for the component-type filter
  // dropdown. Ordered by their canonical label.
  const typeOptions = useMemo(() => {
    const set = new Set<DisplayType>();
    for (const g of groups) {
      for (const e of g.entries) {
        set.add(displayComponentType(e));
      }
    }
    return Array.from(set).sort((a, b) => displayTypeLabel(a).localeCompare(displayTypeLabel(b)));
  }, [groups]);

  const changedByOptions = useMemo(
    () =>
      Array.from(
        new Set(groups.map((group) => group.changedByName?.trim()).filter((name): name is string => Boolean(name))),
      ).sort((left, right) => left.localeCompare(right)),
    [groups],
  );

  // Apply row-level change/component filters and group-level user/date filters.
  const filteredGroups = useMemo(() => {
    let windowStart: number | null = null;
    let windowEnd: number | null = null;
    if (dateFilter === 'custom') {
      // Inclusive day bounds: from 00:00 on `from` to 23:59:59.999 on `to`.
      const bounds = customRangeBounds(customRange);
      windowStart = bounds.start;
      windowEnd = bounds.end;
    } else {
      const reference = dateReference ?? mountNow;
      windowEnd = reference;
      windowStart = reference - DATE_FILTER_DAYS[dateFilter] * 86_400_000;
    }

    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => {
          if (changeTypeFilter.length && (e.changeType === undefined || !changeTypeFilter.includes(e.changeType)))
            return false;
          if (componentTypeFilter.length && !componentTypeFilter.includes(displayComponentType(e)))
            return false;
          return true;
        }),
      }))
      .filter((g) => {
        if (g.entries.length === 0) return false;
        if (changedByFilter.length && (!g.changedByName || !changedByFilter.includes(g.changedByName.trim()))) {
          return false;
        }
        if (windowStart !== null || windowEnd !== null) {
          const t = g.changedOn ? parseDateTime(g.changedOn) : NaN;
          if (Number.isNaN(t)) return false;
          if (windowStart !== null && t < windowStart) return false;
          if (windowEnd !== null && t > windowEnd) return false;
        }
        return true;
      });
  }, [
    groups,
    changeTypeFilter,
    componentTypeFilter,
    changedByFilter,
    dateFilter,
    dateReference,
    mountNow,
    customRange,
  ]);

  // Real bounds of a custom range, so the activity chart and trend use the
  // selected dates rather than a span measured back from now.
  const customWindow = useMemo(() => {
    if (dateFilter !== 'custom') return null;
    const { start, end } = customRangeBounds(customRange);
    return start !== null && end !== null ? { start, end } : null;
  }, [dateFilter, customRange]);

  const filtersActive =
    changeTypeFilter.length > 0 ||
    componentTypeFilter.length > 0 ||
    changedByFilter.length > 0 ||
    dateFilter !== DEFAULT_DATE_FILTER;

  const clearFilters = () => {
    setChangeTypeFilter([]);
    setComponentTypeFilter([]);
    setChangedByFilter([]);
    setDateFilter(DEFAULT_DATE_FILTER);
    setDateReference(Date.now());
    setCustomRange(emptyCustomRange());
  };

  // The Audit Summary aggregates the *same* entries the history lists, so the
  // two tabs can never report different totals.
  const filteredEntries = useMemo(
    () => filteredGroups.flatMap((group) => group.entries),
    [filteredGroups],
  );

  const dateFilterDays =
    dateFilter === 'custom'
      ? customRangeDays(customRange)
      : DATE_FILTER_DAYS[dateFilter];
  const rangeLabel =
    dateFilter === 'custom' && isCustomRangeComplete(customRange)
      ? formatCustomRangeLabel(customRange)
      : DATE_FILTER_LABEL[dateFilter].toLowerCase();

  /**
   * Kinds currently selected, derived from the existing change-type filter.
   * "Published" has no `ChangeType` of its own, so it is reported but not
   * selectable through the shared filter.
   */
  const selectedKinds = useMemo<ChangeKind[]>(
    () =>
      changeTypeFilter.map((type) =>
        type === ChangeType.Created ? 'Added' : type === ChangeType.Deleted ? 'Removed' : 'Updated',
      ),
    [changeTypeFilter],
  );

  const toggleUserFilter = (name: string) =>
    setChangedByFilter((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );

  const toggleComponentFilter = (type: number) =>
    setComponentTypeFilter((current) =>
      current.includes(type as ComponentType)
        ? current.filter((value) => value !== type)
        : [...current, type as ComponentType],
    );

  const toggleKindFilter = (kind: ChangeKind) => {
    const type =
      kind === 'Added'
        ? ChangeType.Created
        : kind === 'Removed'
          ? ChangeType.Deleted
          : kind === 'Updated'
            ? ChangeType.Updated
            : undefined;
    if (type === undefined) return;
    setChangeTypeFilter((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  };

  const stats = useMemo(() => {
    let created = 0;
    let updated = 0;
    let deleted = 0;
    for (const g of filteredGroups) {
      for (const e of g.entries) {
        if (e.changeType === ChangeType.Created) created += 1;
        else if (e.changeType === ChangeType.Updated) updated += 1;
        else if (e.changeType === ChangeType.Deleted) deleted += 1;
      }
    }
    return { created, updated, deleted };
  }, [filteredGroups]);


  if (!agent) {
    return (
      <div className={styles.empty}>
        <img src={noResultsImage} alt="" role="presentation" className={styles.emptyStateImg} />
        <Subtitle2>No agent selected</Subtitle2>
        <Body1>Select a tracked agent from the left to view its change history.</Body1>
      </div>
    );
  }

  return (
    <div className={styles.root} ref={timelineRef} tabIndex={-1}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <div className={styles.titleRow}>
            <Tooltip
              content={agent.agentName || agent.agentId}
              relationship="label"
              withArrow
            >
              <Subtitle2 as="h2" className={styles.agentTitle}>
                {agent.agentName || agent.agentId}
              </Subtitle2>
            </Tooltip>
            {studioUrl && (
              <Tooltip content="Open agent in Copilot Studio" relationship="label" withArrow>
                <Button
                  as="a"
                  href={studioUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="small"
                  appearance="subtle"
                  icon={<OpenRegular />}
                  aria-label="Open agent in Copilot Studio"
                />
              </Tooltip>
            )}
          </div>
          <Tooltip content={isFetching ? 'Refreshing…' : 'Refresh'} relationship="label">
            <Button
              appearance="subtle"
              icon={isFetching ? <Spinner size="tiny" /> : <ArrowSyncRegular />}
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label={isFetching ? 'Refreshing…' : 'Refresh'}
            />
          </Tooltip>
        </div>
        {(ownerName || catalogAgent?.publishedByName) && (
          <div className={styles.metaRow}>
            <Tooltip content="Agent owner and last publisher" relationship="description" withArrow>
              <Caption1 className={styles.ownerPublisherMeta}>
                {ownerName && (
                  <span className={styles.ownerDetail}>
                  <PersonRegular fontSize={13} />
                  {ownerName}
                  </span>
                )}
                {catalogAgent?.publishedByName && (
                  <span>Published by {catalogAgent.publishedByName}</span>
                )}
              </Caption1>
            </Tooltip>
          </div>
        )}
        {displayedPublishedOn && (
          <div className={styles.metaRow}>
            <Tooltip content="Last published" relationship="description" withArrow>
              <Caption1 className={styles.ownerMeta}>
                <RocketRegular fontSize={13} />
                Published {formatPublished(displayedPublishedOn)}
              </Caption1>
            </Tooltip>
          </div>
        )}
        <div className={styles.metaFilterRow}>
          <div className={styles.metaRow}>
            <Caption1 className={mergeClasses(styles.toolbarMeta, styles.changeHistoryLabel)}>
              {activeTab === 'summary' ? 'Audit summary' : 'Change history'}
            </Caption1>
            {stats.created > 0 && (
              <Tooltip content={`${stats.created} components added`} relationship="description">
                <span className={`${styles.miniStat} ${styles.miniStatAdded}`}>+{stats.created}</span>
              </Tooltip>
            )}
            {stats.updated > 0 && (
              <Tooltip content={`${stats.updated} components updated`} relationship="description">
                <span className={`${styles.miniStat} ${styles.miniStatUpdated}`}>~{stats.updated}</span>
              </Tooltip>
            )}
            {stats.deleted > 0 && (
              <Tooltip content={`${stats.deleted} components removed`} relationship="description">
                <span className={`${styles.miniStat} ${styles.miniStatRemoved}`}>−{stats.deleted}</span>
              </Tooltip>
            )}
          </div>

          <div className={styles.toolbarActions}>
          <Menu
            checkedValues={{ user: changedByFilter }}
            onCheckedValueChange={(_, data) => {
              if (data.name === 'user') setChangedByFilter(data.checkedItems);
            }}
          >
            <MenuTrigger disableButtonEnhancement>
              <MenuButton
                className={styles.userFilterMenuButton}
                size="small"
                disabled={changedByOptions.length === 0}
                aria-label="Filter by user full name"
              >
                {changedByFilter.length > 1
                  ? `${changedByFilter.length} users selected`
                  : changedByFilter[0] ?? 'All users'}
              </MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {changedByOptions.map((name) => (
                  <MenuItemCheckbox key={name} name="user" value={name}>
                    {name}
                  </MenuItemCheckbox>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Dropdown
            className={styles.filterDropdown}
            size="small"
            multiselect
            placeholder="All changes"
            selectedOptions={changeTypeFilter.map(String)}
            value={
              changeTypeFilter.length > 1
                ? `${changeTypeFilter.length} changes selected`
                : changeTypeFilter[0] !== undefined
                  ? CHANGE_TYPE_LABEL[changeTypeFilter[0]]
                  : ''
            }
            onOptionSelect={(_, d) => setChangeTypeFilter(d.selectedOptions.map(Number) as ChangeType[])}
            aria-label="Filter by change type"
          >
            <Option value={String(ChangeType.Created)}>Added</Option>
            <Option value={String(ChangeType.Updated)}>Updated</Option>
            <Option value={String(ChangeType.Deleted)}>Removed</Option>
          </Dropdown>
          <Menu
            checkedValues={{ date: [dateFilter] }}
            onCheckedValueChange={(_, d) =>
              applyDateFilter((d.checkedItems[0] as DateFilter) ?? DEFAULT_DATE_FILTER)
            }
          >
            <MenuTrigger disableButtonEnhancement>
              <MenuButton
                className={styles.filterMenuButton}
                size="small"
                aria-label="Filter by date"
              >
                {dateFilter === 'custom' && isCustomRangeComplete(customRange)
                  ? formatCustomRangeLabel(customRange)
                  : DATE_FILTER_LABEL[dateFilter]}
              </MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItemRadio name="date" value="30m">Last 30 mins</MenuItemRadio>
                <MenuItemRadio name="date" value="1d">Last 24 hours</MenuItemRadio>
                <MenuItemRadio name="date" value="7d">Last 7 days</MenuItemRadio>
                <MenuItemRadio name="date" value="30d">Last 30 days</MenuItemRadio>
                <MenuItemRadio name="date" value="custom">Custom range</MenuItemRadio>
              </MenuList>
            </MenuPopover>
          </Menu>

          <Dialog
            open={customRangeOpen}
            // Dismissing (Esc, overlay click) discards the draft, exactly like
            // Cancel — the applied filter is only changed by Apply.
            onOpenChange={(_, data) => setCustomRangeOpen(data.open)}
          >
            <DialogSurface className={styles.dateRangeSurface}>
              <DialogBody>
                <DialogTitle>Set date range</DialogTitle>
                <DialogContent className={styles.dateRangeContent}>
                  <div className={styles.dateTimeRow}>
                    <Field label="From" className={styles.dateField}>
                      <DatePicker
                        value={fromIsoDate(draftRange.from)}
                        minDate={retentionDates.min}
                        maxDate={fromIsoDate(draftRange.to) ?? retentionDates.max}
                        placeholder="Select a start date"
                        appearance="outline"
                        onSelectDate={(date) =>
                          setDraftRange((current) => ({
                            ...current,
                            from: date
                              ? clampIsoDate(toIsoDate(date), retention.min, retention.max)
                              : '',
                          }))
                        }
                      />
                    </Field>
                    <Field label="Time" className={styles.timeField}>
                      <Input
                        type="time"
                        // Both rows label their time box "Time"; the accessible
                        // name has to say which one it is.
                        aria-label="Start time"
                        value={draftRange.fromTime}
                        onChange={(_, data) =>
                          setDraftRange((current) => ({ ...current, fromTime: data.value }))
                        }
                      />
                    </Field>
                  </div>
                  <div className={styles.dateTimeRow}>
                    <Field label="To" className={styles.dateField}>
                      <DatePicker
                        value={fromIsoDate(draftRange.to)}
                        minDate={fromIsoDate(draftRange.from) ?? retentionDates.min}
                        maxDate={retentionDates.max}
                        placeholder="Select an end date"
                        appearance="outline"
                        onSelectDate={(date) =>
                          setDraftRange((current) => ({
                            ...current,
                            to: date
                              ? clampIsoDate(toIsoDate(date), retention.min, retention.max)
                              : '',
                          }))
                        }
                      />
                    </Field>
                    <Field label="Time" className={styles.timeField}>
                      <Input
                        type="time"
                        aria-label="End time"
                        value={draftRange.toTime}
                        onChange={(_, data) =>
                          setDraftRange((current) => ({ ...current, toTime: data.value }))
                        }
                      />
                    </Field>
                  </div>
                  <Caption1 className={styles.dateRangeHint}>
                    Audit history is retained for the last 30 days, so earlier dates can't be
                    selected. Leave the times blank to cover whole days.
                  </Caption1>
                </DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={() => setCustomRangeOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    appearance="primary"
                    disabled={!isCustomRangeComplete(draftRange)}
                    onClick={commitCustomRange}
                  >
                    Apply
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
          <Dropdown
            className={styles.filterDropdownLabel}
            size="small"
            multiselect
            placeholder="All components"
            disabled={typeOptions.length === 0}
            selectedOptions={componentTypeFilter.map(String)}
            value={
              componentTypeFilter.length > 1
                ? `${componentTypeFilter.length} components selected`
                : componentTypeFilter[0] !== undefined
                  ? displayTypeLabel(componentTypeFilter[0])
                  : ''
            }
            onOptionSelect={(_, d) =>
              setComponentTypeFilter(d.selectedOptions.map((v) => Number(v) as ComponentType))
            }
            aria-label="Filter by component type"
          >
            {typeOptions.map((t) => (
              <Option key={String(t)} value={String(t)}>
                {displayTypeLabel(t)}
              </Option>
            ))}
          </Dropdown>
          {filtersActive && (
            <Tooltip content="Clear filters" relationship="label">
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                onClick={clearFilters}
                aria-label="Clear filters"
              />
            </Tooltip>
          )}
          </div>
        </div>

        <TabList
          className={styles.tabList}
          appearance="subtle"
          size="medium"
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as 'history' | 'summary')}
        >
          <Tab value="history">
            {`Change history${filteredEntries.length ? ` (${filteredEntries.length})` : ''}`}
          </Tab>
          <Tab value="summary">Audit summary</Tab>
        </TabList>
      </div>

      {isLoading ? (
        <Spinner size="small" label="Loading change history..." />
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <HistoryRegular className={styles.emptyIcon} />
          <Body1Strong>No changes recorded yet</Body1Strong>
          <Caption1>
            Every save to this agent — tools, topics, knowledge and settings like Code Interpreter or Reasoning — is
            tracked here automatically. Use “Refresh” if a recent change hasn’t appeared yet.
          </Caption1>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className={styles.empty}>
          <HistoryRegular className={styles.emptyIcon} />
          <Body1Strong>No changes match your filters</Body1Strong>
          <Caption1>Try adjusting the change type, date or component filters.</Caption1>
          <Button appearance="secondary" icon={<DismissRegular />} onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : activeTab === 'summary' ? (
        <AuditSummary
          entries={filteredEntries}
          dateFilterDays={dateFilterDays}
          dateWindow={customWindow}
          rangeLabel={rangeLabel}
          componentTypeOf={displayComponentType}
          componentLabelOf={(type) => displayTypeLabel(type as ComponentType)}
          componentIconOf={componentIcon}
          selectedUsers={changedByFilter}
          selectedComponents={componentTypeFilter}
          selectedKinds={selectedKinds}
          onToggleUser={toggleUserFilter}
          onToggleComponent={toggleComponentFilter}
          onToggleKind={toggleKindFilter}
          onClearFilters={clearFilters}
          hasActiveFilters={filtersActive}
        />
      ) : (
        <Accordion multiple collapsible defaultOpenItems={filteredGroups[0] ? [filteredGroups[0].saveTransactionId] : []}>
          <div className={styles.groups}>
            {filteredGroups.map((group) => {
              const groupVersion = versionByGroup.get(group.saveTransactionId);
              return (
              <div className={styles.groupWrap} key={group.saveTransactionId}>
                <AccordionItem value={group.saveTransactionId} className={styles.groupCard}>
                  <AccordionHeader expandIconPosition="end">
                    <div className={styles.groupHeader}>
                      <Avatar name={group.changedByName ?? 'Unknown'} size={32} color="neutral" />
                      <div className={styles.groupHeaderText}>
                        <Body1Strong>{formatDateTime(group.changedOn)}</Body1Strong>
                        {group.changedByName && <Caption1>by {group.changedByName}</Caption1>}
                      </div>
                      <div className={styles.groupMeta}>
                        <GroupMix entries={group.entries} />
                        {groupVersion && (
                          <Tooltip content="Agent version for this save" relationship="description">
                            <Badge className={styles.versionTag} appearance="outline" color="informative">
                              v{groupVersion}
                            </Badge>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div className={styles.panel}>
                      {group.entries.map((entry) => (
                        <ChangeRow
                          key={entry.id}
                          entry={entry}
                          version={groupVersion}
                          orgUrl={agent.environmentUrl}
                          localPreview={Boolean(isLocalPreview)}
                          childAgentName={componentParents?.[entry.componentId ?? '']}
                        />
                      ))}
                    </div>
                  </AccordionPanel>
                </AccordionItem>
              </div>
              );
            })}
          </div>
        </Accordion>
      )}
    </div>
  );
}
