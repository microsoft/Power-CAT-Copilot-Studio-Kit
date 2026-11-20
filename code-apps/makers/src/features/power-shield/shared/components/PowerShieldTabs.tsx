import { TabList, Tab, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';
import { useLocation } from 'react-router-dom';
import { useNavigate } from '../hooks/useNavigate';
import { REQUEST_CENTER_TOUR_TARGETS } from './RequestCenterTour';

// ─────────────────────────────────────────────────────────────────────────────
// Route-backed Power Shield tabs (T027, FR-001). The active tab is derived from
// the URL, not local state, so a direct link or a browser Back lands on the right
// surface. Each tab carries a visible info icon; its description is announced
// through a tooltip. Rendered on the left of the landing header row.
// ─────────────────────────────────────────────────────────────────────────────

export type PowerShieldTab = 'connector' | 'credits';

const useStyles = makeStyles({
  tabs: {
    '@media (max-width: 640px)': {
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
});

/** Derives the active tab from the current pathname. */
export function tabFromPathname(pathname: string): PowerShieldTab {
  return pathname.replace(/\/$/, '').endsWith('/credits') ? 'credits' : 'connector';
}

interface InfoTabProps {
  value: PowerShieldTab;
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

export function PowerShieldTabs() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = tabFromPathname(pathname);

  const handleSelect = (_: SelectTabEvent, data: SelectTabData) => {
    const next = data.value as PowerShieldTab;
    if (next === active) return;
    navigate(next === 'credits' ? '/credits' : '/');
  };

  return (
    <TabList
      className={styles.tabs}
      selectedValue={active}
      onTabSelect={handleSelect}
      aria-label="Request types"
    >
      <InfoTab
        value="connector"
        label="Connector Requests"
        description="Request and track connector access for your environments."
        tourId={REQUEST_CENTER_TOUR_TARGETS.connectorsTab}
      />
      <InfoTab
        value="credits"
        label="Copilot Credits"
        description="Request and track Copilot Credits for your environments."
        tourId={REQUEST_CENTER_TOUR_TARGETS.creditsTab}
      />
    </TabList>
  );
}

export default PowerShieldTabs;