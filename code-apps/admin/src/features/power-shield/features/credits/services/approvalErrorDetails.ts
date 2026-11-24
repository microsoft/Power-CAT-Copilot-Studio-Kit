/** Extra facts shown under "Show details" when an approval step fails. */
export interface ApprovalErrorDetails {
  /** The step that failed, in plain words. */
  step: string;
  /** A code admins can quote to support; matches the browser console log. */
  reference: string;
  /** A short, cleaned-up system message. The full error is only in the browser console. */
  systemMessage?: string;
}

const MAX_LENGTH = 300;

/** Keeps only a short, link-free message so the dialog never shows web addresses or long payloads. */
export function cleanSystemMessage(err: unknown): string | undefined {
  const raw =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : undefined;
  if (!raw) return undefined;
  const text = raw.replace(/https?:\/\/\S+/gi, '[link removed]').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

/** Logs the full error to the browser console and returns the short details for the dialog. */
export function describeFailure(
  step: string,
  err: unknown,
  ids: { requestId: string; reference: string },
): ApprovalErrorDetails {
  console.error('[Credits approval] Step failed:', { step, requestId: ids.requestId, reference: ids.reference, error: err });
  return { step, reference: ids.reference, systemMessage: cleanSystemMessage(err) };
}
