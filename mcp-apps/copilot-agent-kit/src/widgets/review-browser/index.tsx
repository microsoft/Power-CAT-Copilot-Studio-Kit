import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, createDarkTheme, type Theme } from "@fluentui/react-components";
import {
  copilotStudioReviewBrand,
  copilotStudioReviewLightTheme,
} from "../../agent-review/ui/index.js";
import { McpAppProvider, useMcpApp } from "../shared/McpAppProvider";
import { ReviewBrowserApp } from "./ReviewBrowserApp";

const darkTheme: Theme = {
  ...createDarkTheme(copilotStudioReviewBrand),
  borderRadiusMedium: "6px",
  borderRadiusXLarge: "12px",
};

function ThemedApp() {
  const { theme } = useMcpApp();
  return (
    <FluentProvider theme={theme === "dark" ? darkTheme : copilotStudioReviewLightTheme}>
      <ReviewBrowserApp />
    </FluentProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <McpAppProvider>
      <ThemedApp />
    </McpAppProvider>
  </StrictMode>,
);
