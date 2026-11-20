import type { ReactNode } from 'react';
import {
  Body1Strong,
  Button,
  SearchBox,
  Toolbar,
  ToolbarGroup,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  FullScreenMaximize24Regular,
  FullScreenMinimize24Regular,
  Grid24Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  toolbar: {
    height: 'auto',
    minHeight: '56px',
    overflow: 'visible',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    '@media (max-width: 900px)': {
      minHeight: '96px',
      gridTemplateColumns: 'auto minmax(280px, 1fr)',
    },
    '@media (max-width: 700px)': {
      minHeight: '136px',
      gridTemplateColumns: '1fr',
    },
  },
  leading: {
    gridColumn: '1',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginRight: 'auto',
  },
  notice: {
    gridColumn: '2',
    minWidth: 0,
    '@media (max-width: 700px)': {
      gridColumn: '1',
    },
  },
  title: {
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  selectionGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  group: {
    gridColumn: '3',
    marginLeft: 'auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    '@media (max-width: 900px)': {
      gridColumn: '1 / -1',
      justifyContent: 'flex-end',
    },
    '@media (max-width: 700px)': {
      gridColumn: '1',
      justifyContent: 'flex-start',
    },
  },
  commandButton: {
    minHeight: '32px',
    fontWeight: tokens.fontWeightRegular,
  },
  iconButton: {
    minWidth: '32px',
    width: '32px',
    height: '32px',
    padding: 0,
  },
  search: {
    width: 'clamp(200px, 20vw, 280px)',
    maxWidth: '100%',
  },
});

interface GridToolbarProps {
  title?: string;
  searchValue: string;
  searchPlaceholder: string;
  isFullscreen: boolean;
  selectionActions?: ReactNode;
  selectionNotice?: ReactNode;
  showExport?: boolean;
  onSearchChange: (value: string) => void;
  onExport: () => void;
  onEditColumns: () => void;
  onFullscreen: () => void;
  mountNode?: HTMLElement | null;
}

export function GridToolbar({
  title,
  searchValue,
  searchPlaceholder,
  isFullscreen,
  selectionActions,
  selectionNotice,
  showExport = true,
  onSearchChange,
  onExport,
  onEditColumns,
  onFullscreen,
  mountNode,
}: GridToolbarProps) {
  const styles = useStyles();
  return (
    <>
      <Toolbar className={styles.toolbar} aria-label="Grid actions">
        {(title || selectionActions) && (
          <div className={styles.leading}>
            {title && <Body1Strong className={styles.title}>{title}</Body1Strong>}
            {selectionActions && (
              <ToolbarGroup className={styles.selectionGroup}>
                {selectionActions}
              </ToolbarGroup>
            )}
          </div>
        )}
        {selectionNotice && <div className={styles.notice}>{selectionNotice}</div>}
        <ToolbarGroup className={styles.group}>
          {showExport && (
            <Button className={styles.commandButton} appearance="secondary" icon={<ArrowDownload24Regular />} onClick={onExport}>
              Export
            </Button>
          )}
          <Button className={styles.commandButton} appearance="secondary" icon={<Grid24Regular />} onClick={onEditColumns}>
            Edit columns
          </Button>
          <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Open grid in fullscreen'} relationship="label" mountNode={mountNode}>
            <Button
              className={styles.iconButton}
              appearance="secondary"
              icon={isFullscreen ? <FullScreenMinimize24Regular /> : <FullScreenMaximize24Regular />}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Open grid in fullscreen'}
              onClick={onFullscreen}
            />
          </Tooltip>
          <SearchBox
            className={styles.search}
            value={searchValue}
            placeholder={searchPlaceholder}
            aria-label="Search grid records"
            onChange={(_, data) => onSearchChange(data.value)}
          />
        </ToolbarGroup>
      </Toolbar>
    </>
  );
}
