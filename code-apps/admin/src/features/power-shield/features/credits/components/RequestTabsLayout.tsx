import {
  makeStyles,
  Tab,
  TabList,
  tokens,
  Toolbar,
  ToolbarButton,
  Tooltip,
} from '@fluentui/react-components';
import type { SelectTabEvent, SelectTabData } from '@fluentui/react-components';
import {
  BugRegular,
  InfoRegular,
  QuestionCircleRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { Outlet, useLocation } from 'react-router-dom';
import { useNavigate, POWER_SHIELD_BASE } from '../../../shared/hooks/useNavigate';
import { useLayoutStyles } from '../../../shared/styles';
import { RequestCenterTour, REQUEST_CENTER_TOUR_TARGETS } from './RequestCenterTour';

// ─────────────────────────────────────────────────────────────────────────────
// Power Shield landing layout.
//
// Owns the single page container for the two tenant-wide LIST surfaces —
// Connector Requests (the existing home) and Copilot Credits — and renders one
// header row: route-backed tabs on the left, a command Toolbar on the right.
// Each tab's description lives in an info tooltip on the tab itself. Detail
// routes are registered OUTSIDE this layout, so the row never appears on a
// detail screen.
//
// The active tab is derived from the URL (never from local state), so deep links
// and browser history stay correct.
// ─────────────────────────────────────────────────────────────────────────────

const CREDITS_PATH = `${POWER_SHIELD_BASE}/credits`;
const NARROW = '@media (max-width: 640px)';

const useStyles = makeStyles({
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  headerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
  },
  tabs: {
    [NARROW]: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  tabLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  infoIcon: {
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    flexWrap: 'wrap',
  },
});

const CONNECTORS_TAB = 'connectors';
const CREDITS_TAB = 'credits';

interface InfoTabProps {
  value: string;
  label: string;
  description: string;
  tourId: string;
}

/** Tab with a visible, non-interactive info icon; the description is announced via tooltip. */
function InfoTab({ value, label, description, tourId }: InfoTabProps) {
  const styles = useStyles();
  return (
    <Tooltip content={description} relationship="description" positioning="below-start">
      <Tab value={value} data-tour-id={tourId}>
        <span className={styles.tabLabel}>
          {label}
          <InfoRegular aria-hidden className={styles.infoIcon} />
        </span>
      </Tab>
    </Tooltip>
  );
}

export function RequestTabsLayout() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const navigate = useNavigate();
  const location = useLocation();

  const onCreditsRoute =
    location.pathname === CREDITS_PATH || location.pathname.startsWith(`${CREDITS_PATH}/`);
  const selectedValue = onCreditsRoute ? CREDITS_TAB : CONNECTORS_TAB;

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    if (data.value === CREDITS_TAB) {
      void navigate('/credits');
    } else {
      void navigate('/');
    }
  };

  return (
    <div className={layoutStyles.pageContainer}>
      <h1 className={styles.visuallyHidden}>Request Center</h1>

      <div className={styles.headerRow}>
        <TabList
          className={styles.tabs}
          selectedValue={selectedValue}
          onTabSelect={handleTabSelect}
          aria-label="Request type"
        >
          <InfoTab
            value={CONNECTORS_TAB}
            label="Connector Requests"
            description="Connector access governance for your organization."
            tourId={REQUEST_CENTER_TOUR_TARGETS.connectorsTab}
          />
          <InfoTab
            value={CREDITS_TAB}
            label="Copilot Credits Requests"
            description="Review and allocate tenant-wide Copilot Credit requests."
            tourId={REQUEST_CENTER_TOUR_TARGETS.creditsTab}
          />
        </TabList>

        <Toolbar size="small" aria-label="Page commands" className={styles.actions}>
          <RequestCenterTour />
          <Tooltip content="Settings" relationship="label">
            <ToolbarButton
              appearance="subtle"
              icon={<SettingsRegular />}
              onClick={() => void navigate('/settings')}
              aria-label="Settings"
            />
          </Tooltip>
          <Tooltip content="Help - opens in new tab" relationship="description">
            <ToolbarButton
              appearance="subtle"
              icon={<QuestionCircleRegular />}
              as="a"
              href="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/POWER_SHIELD.md"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Help"
            />
          </Tooltip>
          <Tooltip content="Report a bug - opens in new tab" relationship="description">
            <ToolbarButton
              appearance="subtle"
              icon={<BugRegular />}
              as="a"
              href="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/new?template=bug_report.yml"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Report a bug"
            />
          </Tooltip>
        </Toolbar>
      </div>

      <Outlet />
    </div>
  );
}

export default RequestTabsLayout;