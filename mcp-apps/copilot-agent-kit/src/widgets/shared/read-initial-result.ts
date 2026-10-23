import type { App } from "@modelcontextprotocol/ext-apps";
import { createInitialToolDataRecovery } from "./initial-tool-data";

export async function readInitialResult(app: Pick<App, "callServerTool">, result: Awaited<ReturnType<App["callServerTool"]>>, opener: string) {
  let data: unknown = null;
  let metadata = result._meta;
  let failure: unknown;
  const recovery = createInitialToolDataRecovery({
    name: opener, callTool: request => app.callServerTool(request),
    getData: () => data, replaceData: next => { data = next; },
    replaceMetadata: next => { metadata = next; }, reportError: error => { failure = error; },
  });
  await recovery.receiveResult(result);
  await recovery.ready();
  if (failure) throw failure;
  if (!data) throw new Error("The complete initial app data is unavailable.");
  return { data, metadata };
}
