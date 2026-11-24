import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  TabList,
  Tab,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components';
import { useLayoutStyles } from '../../../shared/styles';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { ConnectionHealthScreen } from './ConnectionHealthScreen';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  headerGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  tabList: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tabPanel: {
    paddingTop: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    '&[hidden]': {
      display: 'none',
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TabValue = 'connections' | 'notifications';

const VALID_TABS: readonly TabValue[] = ['connections', 'notifications'];
const DEFAULT_TAB: TabValue = 'connections';

function normalizeTab(raw: string | null): TabValue {
  return VALID_TABS.includes(raw as TabValue) ? (raw as TabValue) : DEFAULT_TAB;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combined "Setup" admin screen. Hosts pre-requisite configuration surfaces
 * an admin must complete before Power Shield is fully usable, organized into
 * Fluent UI tabs. Currently exposes Connections (connection references +
 * cloud flows) and Notifications (email delivery settings); additional setup
 * tabs can be added without changing the screen's name or top-level route.
 *
 * The selected tab is synced to the `?tab=` query parameter so deep-links
 * from the Settings hub and Home banners can land on a specific tab. Both
 * tab bodies are kept mounted (the inactive one is hidden via the `hidden`
 * attribute) to preserve in-tab state and avoid re-running the heavy data
 * loading effects of the Connections content on every tab switch.
 */
export function SetupScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const selectedTab = useMemo(() => normalizeTab(rawTab), [rawTab]);

  // Normalize invalid tab values in the URL so the address bar matches state.
  useEffect(() => {
    if (rawTab !== null && rawTab !== selectedTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', selectedTab);
      setSearchParams(next, { replace: true });
    }
  }, [rawTab, selectedTab, searchParams, setSearchParams]);

  const handleTabSelect = useCallback(
    (_event: SelectTabEvent, data: SelectTabData) => {
      const value = data.value as TabValue;
      const next = new URLSearchParams(searchParams);
      next.set('tab', value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className={layoutStyles.pageContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Settings', route: '/settings' }, { label: 'Setup' }]} />

      <div className={styles.headerGroup}>
        <div className={styles.header}>
          <Text as="h1" size={700} weight="semibold">
            Setup
          </Text>
        </div>

        <TabList
          className={styles.tabList}
          selectedValue={selectedTab}
          onTabSelect={handleTabSelect}
          aria-label="Request Center setup tabs"
        >
          <Tab id="tab-connections" value="connections" aria-controls="panel-connections">
            Connections
          </Tab>
          <Tab id="tab-notifications" value="notifications" aria-controls="panel-notifications">
            Notifications
          </Tab>
        </TabList>
      </div>

      <div
        id="panel-connections"
        role="tabpanel"
        aria-labelledby="tab-connections"
        hidden={selectedTab !== 'connections'}
        className={styles.tabPanel}
      >
        <ConnectionHealthScreen embedded />
      </div>

      <div
        id="panel-notifications"
        role="tabpanel"
        aria-labelledby="tab-notifications"
        hidden={selectedTab !== 'notifications'}
        className={styles.tabPanel}
      >
        <NotificationSettingsScreen embedded />
      </div>
    </div>
  );
}
