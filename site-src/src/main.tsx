import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./App";

const fontFamily =
  "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";

// Customize the light theme so the Fluent brand ramp matches the deep purple
// used as the primary brand color in the Copilot Agent Kit.
const theme = {
  ...webLightTheme,
  fontFamilyBase: fontFamily,
  fontFamilyMonospace: webLightTheme.fontFamilyMonospace,
  colorBrandBackground: "#833D91",
  colorBrandBackgroundHover: "#6F2F7C",
  colorBrandBackgroundPressed: "#5C2667",
  colorBrandForeground1: "#833D91",
  colorBrandForeground2: "#6F2F7C",
  colorBrandStroke1: "#833D91",
  colorCompoundBrandBackground: "#833D91",
  colorCompoundBrandStroke: "#833D91",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FluentProvider theme={theme} style={{ background: "transparent" }}>
      <App />
    </FluentProvider>
  </StrictMode>
);
