/** Error that keeps the HTTP status returned by a connector call. */
export class ConnectorError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConnectorError';
    this.status = status;
  }
}

/** Builds an error from a failed connector result, keeping its HTTP status when present. */
export function toConnectorError(error: unknown, fallbackMessage: string): ConnectorError {
  const details = (error && typeof error === 'object' ? error : {}) as { message?: unknown; status?: unknown };
  const message = typeof details.message === 'string' && details.message ? details.message : fallbackMessage;
  const status = typeof details.status === 'number' ? details.status : undefined;
  return new ConnectorError(message, status);
}

// Dataverse privilege and membership failures do not always surface a numeric status through the connector.
const ACCESS_DENIED_PATTERN = /\b403\b|forbidden|missing prv|not a member of the organization/i;

/** True when the error indicates the user has no access (HTTP 403) to the environment. */
export function isAccessDeniedError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ConnectorError && error.status === 403) return true;
  return error instanceof Error && ACCESS_DENIED_PATTERN.test(error.message);
}

/** Load-failure title; adds the environment-access hint when the failure is a 403. */
export function loadErrorTitle(subject: string, error: unknown): string {
  return isAccessDeniedError(error)
    ? `Unable to load ${subject}, kindly check if you have access to the environment.`
    : `Unable to load ${subject}.`;
}
