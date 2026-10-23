import { createRoot } from "react-dom/client";
import { FluentProvider, createDarkTheme, type Theme } from "@fluentui/react-components";
import {
  copilotStudioReviewBrand,
  copilotStudioReviewLightTheme,
} from "../../agent-review/ui/index.js";
import "../../agent-debugger/styles/design/index.css";
import "../../agent-debugger/prism-overrides.css";
import { McpAppProvider, useMcpApp } from "../shared/McpAppProvider";
import { AgentDebuggerApp } from "./AgentDebuggerApp";
import { getApplicationRoot } from "../shared/bootstrap-contract";

const darkTheme: Theme = {
  ...createDarkTheme(copilotStudioReviewBrand),
  borderRadiusMedium: "6px",
  borderRadiusXLarge: "12px",
};

function ThemedApp() {
  const { theme } = useMcpApp();
  return (
    <FluentProvider theme={theme === "dark" ? darkTheme : copilotStudioReviewLightTheme}>
      <AgentDebuggerApp />
    </FluentProvider>
  );
}

createRoot(getApplicationRoot("debugger"), { identifierPrefix: "mcp-debugger-" }).render(
  <McpAppProvider view="debugger">
    <ThemedApp />
  </McpAppProvider>,
);
