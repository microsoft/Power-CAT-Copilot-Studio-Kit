import { useLocation } from 'react-router-dom';
import { useNavigate } from '../../../../shared/hooks/useNavigate';
import { CreditWizardShell } from './CreditWizardShell';

/**
 * Route element for the 3-step Copilot Credits wizard (T024).
 *
 * On exit or after a submit that created at least one environment, it returns to
 * the Copilot Credits landing tab.
 *
 * When navigated with a `draftRequestId` in router state (Resume draft / Returned
 * edit), the wizard hydrates from that durable draft (US4). A non-Credits id is
 * routed to the typed not-found (FR-020, SC-004).
 */
export function CreditWizardRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const draftRequestId = (location.state as { draftRequestId?: string } | null)?.draftRequestId;

  return (
    <CreditWizardShell
      draftRequestId={draftRequestId}
      onExit={() => void navigate('/credits')}
      onSubmitted={() => void navigate('/credits')}
      onWrongTypeDraft={() => void navigate('/credit-requests', { replace: true })}
    />
  );
}
