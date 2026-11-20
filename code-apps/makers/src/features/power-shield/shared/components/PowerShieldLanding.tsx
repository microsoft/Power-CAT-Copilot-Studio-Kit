import { Outlet } from 'react-router-dom';
import { makeStyles } from '@fluentui/react-components';
import { useLayoutStyles } from '../styles';
import { PageHeader } from '../../features/home/components/PageHeader';

// ─────────────────────────────────────────────────────────────────────────────
// Power Shield landing layout (T026, FR-001). Renders a single header row (the
// route-backed request-type tabs plus role badge and commands). The active tab's
// screen (Connector Requests or Copilot Credits) renders through the Outlet. The
// single nav entry is preserved — the tabs switch surfaces within this layout.
// ─────────────────────────────────────────────────────────────────────────────

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
});

export function PowerShieldLanding() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  return (
    <div className={layoutStyles.pageContainer}>
      <h1 className={styles.visuallyHidden}>Request Center</h1>
      <PageHeader />
      <Outlet />
    </div>
  );
}

export default PowerShieldLanding;