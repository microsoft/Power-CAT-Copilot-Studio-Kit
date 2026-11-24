import type { Activity } from "../../contracts/transcript";

export function getSessionInfoTurnCount(activities: Activity[]): number | undefined {
  let total = 0;
  let found = false;

  for (const activity of activities) {
    if (activity.valueType !== "SessionInfo" && activity.name !== "SessionInfo") continue;
    const value = Number(
      (activity.value as Record<string, unknown> | undefined)?.["turnCount"],
    );
    if (!Number.isFinite(value) || value < 0) continue;
    total += value;
    found = true;
  }

  return found ? total : undefined;
}
