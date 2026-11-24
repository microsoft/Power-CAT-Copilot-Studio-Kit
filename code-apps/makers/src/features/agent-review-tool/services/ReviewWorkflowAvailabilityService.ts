import { ReviewJobError } from '../agents-experience/contracts/ReviewJob';
import {
  getReviewServiceOrganizationUrl,
  readReviewMetadataRows,
} from './reviewWorkflowMetadata';

const ADDON_UNIQUE_NAME = 'AgentReviewWorkflow';
const WORKFLOW_ID = '71b31233-076b-facf-68e6-6a8b67a7d075';
const WORKFLOW_NAME = 'Review Agent Components';
const CHECK_TIMEOUT_MS = 15_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewWorkflowAvailabilityStatus =
  | 'available'
  | 'missing-addon'
  | 'workflow-disabled'
  | 'workflow-not-found'
  | 'workflow-conflict'
  | 'unsupported-cloud'
  | 'unverifiable';

export interface ReviewWorkflowAvailability {
  status: ReviewWorkflowAvailabilityStatus;
  installation: 'installed' | 'absent' | 'legacy' | 'unverifiable';
  connectionReadiness: 'not-verified';
  message: string;
  addonVersion?: string;
  detail?: string;
}

function status(
  state: ReviewWorkflowAvailabilityStatus,
  installation: ReviewWorkflowAvailability['installation'],
  message: string,
  addonVersion?: string,
): ReviewWorkflowAvailability {
  return {
    status: state,
    installation,
    connectionReadiness: 'not-verified',
    message,
    addonVersion,
  };
}

function isGovernmentOrganization(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname.endsWith('.crm9.dynamics.com')
    || hostname.endsWith('.crm.microsoftdynamics.us')
    || hostname.endsWith('.crm.appsplatform.us');
}

async function isGovernmentEndpoint(organizationUrl: string): Promise<boolean> {
  const definitions = await readReviewMetadataRows(
    organizationUrl,
    'environmentvariabledefinitions',
    'environmentvariabledefinitionid,defaultvalue',
    "schemaname eq 'cat_PowerAutomateEndpoint'",
  );
  if (definitions.length === 0) return false;
  if (definitions.length !== 1) throw new Error('The cloud setting has multiple definitions.');
  const definition = definitions[0];
  const id = definition.environmentvariabledefinitionid;
  if (typeof id !== 'string' || !GUID.test(id)) {
    throw new Error('The cloud setting returned an invalid definition identifier.');
  }
  const values = await readReviewMetadataRows(
    organizationUrl,
    'environmentvariablevalues',
    'value',
    `_environmentvariabledefinitionid_value eq ${id} and statecode eq 0`,
    1,
    'createdon desc',
  );
  const currentValue = values[0]?.value;
  if (currentValue !== undefined && currentValue !== null && typeof currentValue !== 'string') {
    throw new Error('The cloud setting returned an invalid current value.');
  }
  const endpoint = (typeof currentValue === 'string' ? currentValue.trim() : undefined)
    || definition.defaultvalue;
  if (endpoint === undefined || endpoint === null || endpoint === '') return false;
  if (typeof endpoint !== 'string') throw new Error('The cloud setting returned an invalid value.');
  const normalized = endpoint.replace(/[\s_()-]/g, '').toLowerCase();
  if (['gcc', 'gcchigh', 'dod'].includes(normalized)) return true;
  if (normalized === 'commercial') return false;
  throw new Error('The configured Power Automate cloud is not recognized.');
}

async function inspectAvailability(): Promise<ReviewWorkflowAvailability> {
  const organizationUrl = await getReviewServiceOrganizationUrl();
  if (isGovernmentOrganization(organizationUrl) || await isGovernmentEndpoint(organizationUrl)) {
    return status(
      'unsupported-cloud',
      'unverifiable',
      'New Agent Review runs are not available in GCC. You can still read saved reviews. Do not install the commercial review add-on here.',
    );
  }
  const [solutions, workflows] = await Promise.all([
    readReviewMetadataRows(
      organizationUrl,
      'solutions',
      'solutionid,uniquename,version',
      `uniquename eq '${ADDON_UNIQUE_NAME}'`,
    ),
    readReviewMetadataRows(
      organizationUrl,
      'workflows',
      'workflowid,name,statecode',
      `category eq 5 and type eq 1 and (workflowid eq ${WORKFLOW_ID} or name eq '${WORKFLOW_NAME}')`,
    ),
  ]);
  if (solutions.length > 1 || solutions.some(
    (solution) => typeof solution.uniquename !== 'string'
      || solution.uniquename.toLowerCase() !== ADDON_UNIQUE_NAME.toLowerCase()
      || typeof solution.version !== 'string',
  )) {
    throw new Error('The add-on lookup returned invalid solution metadata.');
  }
  const installed = solutions.length === 1;
  const installation = installed ? 'installed' : 'absent';
  const addonVersion = installed ? String(solutions[0].version) : undefined;
  if (workflows.length > 1) {
    return status(
      'workflow-conflict',
      installation,
      'Multiple Review Agent Components workflows were found. Ask an administrator to remove the duplicate before a new review.',
      addonVersion,
    );
  }
  if (workflows.length === 0) {
    // Process reads can be owner-scoped. Solution membership avoids calling an
    // installed but invisible legacy worker missing.
    const components = await readReviewMetadataRows(
      organizationUrl,
      'solutioncomponents',
      'objectid',
      `componenttype eq 29 and objectid eq ${WORKFLOW_ID}`,
    );
    if (components.length > 0) {
      return status(
        'unverifiable',
        installed ? 'installed' : 'legacy',
        'The review workflow exists, but it could not be read. Ask an administrator to check your Process read permission.',
        addonVersion,
      );
    }
    return installed
      ? status(
          'workflow-not-found',
          'installed',
          'The Agent Review Workflow add-on is installed, but its workflow could not be found. Ask an administrator to check the add-on.',
          addonVersion,
        )
      : status(
          'missing-addon',
          'absent',
          'The Agent Review Workflow add-on is not installed. Ask an administrator to install it and run the installer. Saved reviews remain available.',
        );
  }
  const workflow = workflows[0];
  if (typeof workflow.workflowid !== 'string' || !GUID.test(workflow.workflowid)) {
    throw new Error('The review workflow returned an invalid identifier.');
  }
  const state = workflow.statecode;
  if (state !== 0 && state !== 1 && state !== 2 && state !== '0' && state !== '1' && state !== '2') {
    throw new Error('The review workflow did not return a valid activation state.');
  }
  if (state !== 1 && state !== '1') {
    return status(
      'workflow-disabled',
      installed ? 'installed' : 'legacy',
      'The review workflow is off. Ask its owner to run the Agent Review installer and activate the workflow before a new review.',
      addonVersion,
    );
  }
  return status(
    'available',
    installed ? 'installed' : 'legacy',
    'The review workflow is active. Connection health has not been checked.',
    addonVersion,
  );
}

/** Checks installation and worker metadata without a review, writes, or AI calls. */
export async function getReviewWorkflowAvailability(): Promise<ReviewWorkflowAvailability> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inspectAvailability(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('The availability check timed out after 15 seconds.')),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    return {
      ...status(
        'unverifiable',
        'unverifiable',
        'Agent Review availability could not be verified. Check again. If this continues, ask an administrator to check your access and connections.',
      ),
      detail: error instanceof Error ? error.message : 'The metadata check failed.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Rechecks a new submission and blocks it before any job row or AI call is created. */
export async function assertReviewWorkflowAvailable(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const availability = await getReviewWorkflowAvailability();
  signal?.throwIfAborted();
  if (availability.status !== 'available') {
    throw new ReviewJobError('workflow-unavailable', availability.message);
  }
}
