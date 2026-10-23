/** Spec 013 §7: presence of the `agentSettings` key in bot.configuration ⇒ GitHub Copilot harness. */
export function usesCopilotHarness(configuration: string | null | undefined): boolean {
  if (!configuration) return false;
  try {
    const config = JSON.parse(configuration) as Record<string, unknown>;
    return config['agentSettings'] !== undefined;
  } catch {
    return false; // fail-open to standard path
  }
}
