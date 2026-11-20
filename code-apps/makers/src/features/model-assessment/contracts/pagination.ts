export const MAX_VISIBLE_PAGES = 5;

export function visiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const start = Math.max(0, Math.min(currentPage - 2, totalPages - MAX_VISIBLE_PAGES));
  return Array.from({ length: Math.min(MAX_VISIBLE_PAGES, totalPages) }, (_, index) => start + index);
}

export function parsePageNumber(input: string, totalPages: number): number | undefined {
  const page = Number(input);
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(page) || page < 1 || page > totalPages) {
    return undefined;
  }
  return page - 1;
}
