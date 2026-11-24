import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { getReviewWorkflowAvailability } from '../services/ReviewWorkflowAvailabilityService';
import { useMediaQuery } from '../shared/review-shell/useMediaQuery';

const SETUP_GUIDE_URL = 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENTREVIEWTOOL_REFERENCE_GUIDE.md#set-up-agent-review-with-the-setup-wizard-and-installer';

const useStyles = makeStyles({
  body: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  retryAction: {
    minHeight: `calc(${tokens.spacingVerticalXXXL} + ${tokens.spacingVerticalM})`,
  },
});

/** Displays setup failures without blocking agent lists or saved review pages. */
export function ReviewWorkflowNotice() {
  const styles = useStyles();
  const isWide = useMediaQuery('(min-width: 640px)');
  const query = useQuery({
    queryKey: ['agent-review-workflow-availability'],
    queryFn: async () => {
      // The service returns an explicit status on a failed host/metadata read,
      // so React Query's rejection retry cannot retry that transient result.
      for (let attempt = 0; ; attempt++) {
        const availability = await getReviewWorkflowAvailability();
        if (availability.status !== 'unverifiable' || attempt === 2) return availability;
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
    },
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  if (query.isPending || query.isFetchedAfterMount === false) return null;
  const availability = query.isError ? undefined : query.data;
  if (availability?.status === 'available') return null;
  const retryAction = (
    <Button
      size="medium"
      className={styles.retryAction}
      disabled={query.isFetching}
      onClick={() => void query.refetch()}
    >
      {query.isFetching ? 'Checking...' : 'Check again'}
    </Button>
  );
  return (
    <MessageBar intent="warning" layout="multiline" aria-live="assertive">
      <MessageBarBody className={styles.body}>
        <MessageBarTitle>
          {!availability || availability.status === 'unverifiable'
            ? 'Unable to verify Agent Review'
            : availability?.status === 'unsupported-cloud'
              ? 'Agent Review unavailable'
              : 'Agent Review setup required'}
        </MessageBarTitle>
        {availability?.message ?? 'Agent Review availability could not be verified. Check again.'}
        {availability?.status !== 'unsupported-cloud' && (
          <>
            {' '}
            <Link
              inline
              href={SETUP_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Agent Review setup guide (opens in a new tab)"
            >
              Setup guide
            </Link>
          </>
        )}
        {availability?.detail && (
          <Accordion collapsible>
            <AccordionItem value="check-details">
              <AccordionHeader>Check details</AccordionHeader>
              <AccordionPanel>{availability.detail}</AccordionPanel>
            </AccordionItem>
          </Accordion>
        )}
      </MessageBarBody>
      {isWide
        ? <MessageBarActions containerAction={retryAction} />
        : <MessageBarActions>{retryAction}</MessageBarActions>}
    </MessageBar>
  );
}

/** Covers dashboard, direct review links, and saved reports under the same route. */
export function ReviewWorkflowRouteNotice() {
  const { pathname } = useLocation();
  return pathname === '/agent-review-tool' || pathname.startsWith('/agent-review-tool/')
    ? <ReviewWorkflowNotice />
    : null;
}
