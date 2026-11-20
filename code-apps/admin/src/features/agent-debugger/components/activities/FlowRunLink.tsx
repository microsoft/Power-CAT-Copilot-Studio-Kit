import { Button, Link, Spinner, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { getConfiguredPowerAutomateBaseUrl } from '../../../../shared/services/copilotStudioUrl';
import type { StepExecution } from '../../contracts/transcript';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { getFlowRunCandidates } from '../../services/flow-run-service';
import { flowDefinitionId, flowHistoryUrl, flowRunUrl, flowRunWindow } from '../../utils/flow-run-links';
import { rankFlowRunCandidates } from '../../utils/flow-run-matching';

const useStyles = makeStyles({
  content: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  muted: { color: tokens.colorNeutralForeground3 },
  link: { overflowWrap: 'anywhere' },
});

type FlowRunLinkProps = {
  execution?: StepExecution;
  component?: ComponentInfo;
  environmentUrl?: string;
  environmentId?: string;
  conversationId?: string;
  snapshotMode?: boolean;
};

/** Demand-loaded links for the selected live flow invocation, with explicit correlation limits. */
export function FlowRunLink({
  execution, component, environmentUrl, environmentId, conversationId, snapshotMode,
}: FlowRunLinkProps) {
  const styles = useStyles();
  const flowId = flowDefinitionId(component);
  const window = flowRunWindow(execution);
  const unavailable = snapshotMode
    ? 'Run history is available for live Dataverse transcripts, not offline snapshots.'
    : !environmentUrl || !environmentId
      ? 'The environment details needed to open run history are unavailable.'
      : !flowId
        ? 'A unique flow ID could not be resolved from the component definition.'
        : !window
          ? 'This step has no complete execution interval to match against run history.'
          : undefined;
  const portal = useQuery({
    queryKey: ['power-automate-base-url'],
    queryFn: getConfiguredPowerAutomateBaseUrl,
    enabled: !unavailable,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const query = useQuery({
    queryKey: ['agent-debugger-flow-runs', environmentUrl, environmentId, flowId, window?.from, window?.to, conversationId],
    queryFn: () => {
      if (!environmentUrl || !flowId || !window) throw new Error('Flow run lookup context is unavailable.');
      return getFlowRunCandidates({ organizationUrl: environmentUrl, flowId, ...window, conversationId });
    },
    enabled: !unavailable,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (unavailable) return <Text className={styles.muted}>{unavailable}</Text>;
  if (portal.isError) {
    return (
      <div className={styles.content} data-testid="flow-run-links">
        <Text role="alert">{portal.error.message}</Text>
        <Button appearance="transparent" size="small" disabled={portal.isFetching} onClick={() => void portal.refetch()}>
          {portal.isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
    );
  }
  if (portal.isPending || query.isPending) return <Spinner size="tiny" label="Finding flow runs..." />;

  const runs = rankFlowRunCandidates(query.data ?? [], execution);
  return (
    <div className={styles.content} data-testid="flow-run-links">
      {query.isError ? (
        <Text role="alert">{query.error.message}</Text>
      ) : !runs.length ? null : (
        <>
          {runs.length > 1 ? <Text className={styles.muted}>{runs.length} possible runs</Text> : null}
          {runs.map(run => (
            <Link
              key={run.name}
              className={styles.link}
              href={flowRunUrl(portal.data, environmentId!, flowId!, run.name)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open possible flow run ${run.name} in Power Automate (opens in a new tab)`}
            >
              <Open16Regular aria-hidden="true" /> {runs.length === 1
                ? 'Open flow run'
                : `Open run at ${new Date(run.startTime).toLocaleString()} (${run.status})`}
            </Link>
          ))}
        </>
      )}
      {query.isError || !runs.length ? (
        <Tooltip
          content={query.isError
            ? 'Open all runs in Power Automate; no individual run has been matched.'
            : 'No matching run is available in Dataverse. Open all runs in Power Automate.'}
          relationship="description"
        >
          <Link
            className={styles.link}
            href={flowHistoryUrl(portal.data, environmentId!, flowId!)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open flow history in Power Automate (opens in a new tab)"
          >
            <Open16Regular aria-hidden="true" /> Open flow history
          </Link>
        </Tooltip>
      ) : null}
      {query.isError ? (
        <Button appearance="transparent" size="small" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      ) : null}
    </div>
  );
}
