/** Dataverse choice labels arrive in Title Case ("Completed With Errors"); show them in sentence case. */
export function toSentenceCase(label: string): string {
  return label
    .split(' ')
    .map((word, i) => (i > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(' ');
}
