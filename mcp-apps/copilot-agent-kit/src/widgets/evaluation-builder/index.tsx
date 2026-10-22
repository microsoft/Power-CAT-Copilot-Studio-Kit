import { createRoot } from "react-dom/client";
import { McpAppProvider } from "../shared/McpAppProvider";
import { getApplicationRoot } from "../shared/bootstrap-contract";
import { GeneratedEvaluationsApp } from "./GeneratedEvaluationsApp";
import "./evaluation-builder.css";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { useMcpApp } from "../shared/McpAppProvider";

function ThemedApp() {
  const { theme } = useMcpApp();
  return <FluentProvider theme={theme === "dark" ? webDarkTheme : webLightTheme}>
    <GeneratedEvaluationsApp />
  </FluentProvider>;
}

createRoot(getApplicationRoot("evaluation"), { identifierPrefix: "mcp-evaluation-" }).render(
  <McpAppProvider view="evaluation"><ThemedApp /></McpAppProvider>,
);
