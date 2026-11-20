/**
 * paginatedFetchAll - Fetches all records from a Dataverse table using skipToken pagination.
 *
 * The Power Apps SDK returns a max of 500 records per call. This helper
 * loops using the skipToken from each response until all records are retrieved.
 */

import type { IOperationResult } from '@microsoft/power-apps/data';

interface IGetAllOptions {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
  skipToken?: string;
}

type GetAllFn<T> = (options?: IGetAllOptions) => Promise<IOperationResult<T[]>>;

/** Fetches all pages of records, following skipToken until exhausted. */
export async function paginatedFetchAll<T>(
  getAll: GetAllFn<T>,
  options: IGetAllOptions,
): Promise<T[]> {
  const allRecords: T[] = [];
  let currentOptions = { ...options };

  while (true) {
    const result = await getAll(currentOptions);
    if (!result.success) {
      throw new Error((result.error as Error)?.message ?? 'Failed to fetch records');
    }

    const page = result.data ?? [];
    allRecords.push(...page);

    if (!result.skipToken || page.length === 0) break;
    currentOptions = { ...currentOptions, skipToken: result.skipToken };
  }

  return allRecords;
}
