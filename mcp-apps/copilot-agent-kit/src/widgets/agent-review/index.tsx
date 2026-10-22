import {
  FluentProvider,
  createDarkTheme,
  type Theme,
} from "@fluentui/react-components";
import {
  copilotStudioReviewBrand,
  copilotStudioReviewLightTheme,
} from "../../agent-review/ui/index.js";
import { createRoot } from "react-dom/client";
import { AgentReviewApp } from "./AgentReviewApp";
import { McpAppProvider, useMcpApp } from "../shared/McpAppProvider";
import { getApplicationRoot } from "../shared/bootstrap-contract";

const copilotStudioReviewDarkTheme: Theme = {
  ...createDarkTheme(copilotStudioReviewBrand),
  borderRadiusMedium: "6px",
  borderRadiusXLarge: "12px",
};

function ThemedApp() {
  const { theme } = useMcpApp();
  return (
    <FluentProvider
      theme={theme === "dark" ? copilotStudioReviewDarkTheme : copilotStudioReviewLightTheme}
    >
      <AgentReviewApp />
    </FluentProvider>
  );
}

createRoot(getApplicationRoot("review"), { identifierPrefix: "mcp-review-" }).render(
  <McpAppProvider view="review">
    <ThemedApp />
  </McpAppProvider>,
);
