import { build, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/** Builds the real presentation once, in memory, and embeds it in the lazy HTML exporter. */
export function offlineViewerPlugin(): Plugin {
  const moduleId = "virtual:debugger-offline-bundle";
  let pending: Promise<string> | undefined;
  return {
    name: "debugger-offline-presentation",
    resolveId: id => id === moduleId ? `\0${moduleId}` : undefined,
    load(id) {
      if (id !== `\0${moduleId}`) return;
      pending ??= (async () => {
        const result = await build({
          configFile: false,
          root: path.resolve(import.meta.dirname, ".."),
          logLevel: "warn",
          plugins: [react(), {
            name: "offline-import-boundary",
            generateBundle(_, bundle) {
              for (const output of Object.values(bundle)) {
                if (output.type !== "chunk") continue;
                for (const source of Object.keys(output.modules)) {
                  if (/@microsoft[\\/]power-apps|generated[\\/]services|services[\\/](?:dataverse-client|flow-run-service|botcomponents-service)|power-apps-init/.test(source)) {
                    throw new Error(`Offline presentation imports a live service: ${source}`);
                  }
                }
                if (output.imports.length || output.dynamicImports.length) throw new Error("Offline runtime must be a single self-contained script.");
              }
            },
          }],
          build: {
            write: false,
            minify: true,
            sourcemap: false,
            cssCodeSplit: false,
            assetsInlineLimit: Infinity,
            lib: {
              entry: path.resolve(import.meta.dirname, "../src/features/agent-debugger/offline/entry.tsx"),
              name: "AgentDebuggerOffline",
              formats: ["iife"],
            },
          },
          define: { "process.env.NODE_ENV": JSON.stringify("production") },
        });
        const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => "output" in result ? result.output : []);
        const scripts = outputs.filter(output => output.type === "chunk");
        if (scripts.length !== 1) throw new Error("Expected one embedded offline presentation script.");
        const css = outputs.flatMap(output => output.type === "asset" && output.fileName.endsWith(".css")
          ? [typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source)] : []).join("\n");
        return `export default ${JSON.stringify({ script: scripts[0].code, css })};`;
      })();
      return pending;
    },
  };
}
