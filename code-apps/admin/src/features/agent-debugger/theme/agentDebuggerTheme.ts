import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

const agentDebuggerBrand: BrandVariants = {
  10: "#101334",
  20: "#141943",
  30: "#171E52",
  40: "#232C74",
  50: "#2F3A96",
  60: "#3440AB",
  70: "#3845C0",
  80: "#4858EB",
  90: "#5A68EF",
  100: "#6572F1",
  110: "#6F7BF2",
  120: "#8590F5",
  130: "#9BA4F7",
  140: "#AFB7F9",
  150: "#C3C9FB",
  160: "#E5E8FD",
};

export const agentDebuggerLightTheme: Theme = {
  ...createLightTheme(agentDebuggerBrand),
  borderRadiusMedium: "6px",
  borderRadiusXLarge: "12px",
};
