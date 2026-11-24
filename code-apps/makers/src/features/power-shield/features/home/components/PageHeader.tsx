import {
  makeStyles,
  tokens,
  Tooltip,
  Button,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
} from '@fluentui/react-components';
import {
  AddRegular,
  TextBulletListTreeRegular,
  QuestionCircleRegular,
  BugRegular,
} from '@fluentui/react-icons';
import { useLocation } from 'react-router-dom';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { PowerShieldTabs, tabFromPathname } from '../../../shared/components/PowerShieldTabs';
import { RequestCenterTour } from '../../../shared/components/RequestCenterTour';

// ─────────────────────────────────────────────────────────────────────────────
// Landing header row: request-type tabs on the left, a command Toolbar on
// the right. Wraps the commands below the tabs on narrow screens / high zoom.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  headerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
  },
  actions: {
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isCredits = tabFromPathname(pathname) === 'credits';

  return (
    <div className={styles.headerRow}>
      <PowerShieldTabs />

      {/* Right: commands + help/report. Toolbar gives arrow-key navigation. */}
      <Toolbar size="small" aria-label="Page commands" className={styles.actions}>
        {/* The selected tab already picks the request type, so one button creates that type. */}
        <Button
          appearance="primary"
          size="small"
          icon={<AddRegular />}
          onClick={() => void navigate(isCredits ? '/new-request-credits' : '/new-request/environment')}
        >
          {isCredits ? 'New credits request' : 'New connector request'}
        </Button>

        {/* Service Trees only apply to connector requests. */}
        {!isCredits && (
          <Button
            appearance="secondary"
            size="small"
            icon={<TextBulletListTreeRegular />}
            onClick={() => void navigate('/service-trees')}
          >
            Manage Service Trees
          </Button>
        )}

        <ToolbarDivider />

        <RequestCenterTour />

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
  );
}

export default PageHeader;
