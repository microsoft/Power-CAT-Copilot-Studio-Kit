import { useState, useCallback, useEffect } from 'react';
import { EmailsService } from '../../../../../generated/services/EmailsService';
import type { Emails, Emailsstatuscode } from '../../../../../generated/models/EmailsModel';
import type { RequestType } from '../../../models/policyRequest';
import { assertRequestHeaderType } from '../../../shared/services/dataverse/requestHeaderGuard';

export type NotificationEntry = Pick<
  Emails,
  | 'activityid'
  | 'subject'
  | 'torecipients'
  | 'sender'
  | 'createdon'
  | 'senton'
  | 'statuscode'
  | 'description'
>;

export interface UseRequestNotificationsResult {
  notifications: NotificationEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Status code label mapping for email status reason. */
export function statusLabel(code: Emailsstatuscode | undefined): string {
  switch (code) {
    case 1: return 'Draft';
    case 2: return 'Completed';
    case 3: return 'Sent';
    case 4: return 'Received';
    case 5: return 'Canceled';
    case 6: return 'Pending Send';
    case 7: return 'Sending';
    case 8: return 'Failed';
    default: return '-';
  }
}

/**
 * Fetches email notification records linked to a Policy Request via regardingobjectid.
 * Returns results ordered by createdon descending (recent first).
 *
 * When `assertType` is supplied (the credit detail passes 'Credits'), the request
 * header type is validated BEFORE any email row is read, so a wrong-type
 * notification list can never leak across experiences (FR-035).
 */
export function useRequestNotifications(
  requestId: string,
  assertType?: RequestType,
): UseRequestNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (assertType) {
        await assertRequestHeaderType(requestId, assertType);
      }
      const filterStr = `_regardingobjectid_value eq '${requestId}'`;
      const result = await EmailsService.getAll({
        filter: filterStr,
        select: [
          'activityid',
          'subject',
          'torecipients',
          'sender',
          'createdon',
          'senton',
          'statuscode',
          'description',
        ],
        orderBy: ['createdon desc'],
      });
      setNotifications((result.data ?? []) as NotificationEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [requestId, assertType]);

  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);

  return { notifications, isLoading, error, refresh: fetchNotifications };
}
