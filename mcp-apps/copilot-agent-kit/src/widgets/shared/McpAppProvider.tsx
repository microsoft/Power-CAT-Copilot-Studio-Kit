import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { PortalMountNodeProvider } from "@fluentui/react-components";
import { getMcpBootstrap, type AppView, type McpBootstrap } from "./bootstrap-contract";

interface McpContext {
  app: App | null;
  data: unknown;
  replaceData: (data: unknown) => void;
  theme: "light" | "dark";
  host: McpUiHostContext | undefined;
  metadata: Record<string, unknown> | undefined;
  toolInput?: Record<string, unknown>;
  replaceMetadata: (metadata: Record<string, unknown> | undefined) => void;
  readInitialResult?: McpBootstrap["readInitialResult"];
}

const Context = createContext<McpContext>({
  app: null,
  data: null,
  replaceData: () => undefined,
  theme: "light",
  host: undefined,
  metadata: undefined,
  replaceMetadata: () => undefined,
});

export function McpAppProvider({ children, view }: { children: ReactNode; view?: AppView }) {
  const bootstrap = getMcpBootstrap(view);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const { app, data, host, metadata, toolInput } = useSyncExternalStore(
    bootstrap.subscribe,
    bootstrap.getSnapshot,
  );

  return (
    <Context.Provider value={{
      app,
      data,
      replaceData: bootstrap.replaceData,
      host,
      theme: host?.theme === "dark" ? "dark" : "light",
      metadata,
      toolInput,
      replaceMetadata: bootstrap.replaceMetadata ?? (() => undefined),
      readInitialResult: bootstrap.readInitialResult,
    }}>
      <div ref={setPortalRoot} data-mcp-portal-root={view ?? "app"} />
      <PortalMountNodeProvider value={portalRoot ?? undefined}>
        {portalRoot ? children : null}
      </PortalMountNodeProvider>
    </Context.Provider>
  );
}

export function useMcpApp() {
  return useContext(Context);
}
