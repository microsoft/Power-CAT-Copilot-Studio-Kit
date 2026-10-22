export function defaultProjectName(date = new Date()): string {
  return `Agent Review ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)}`;
}
