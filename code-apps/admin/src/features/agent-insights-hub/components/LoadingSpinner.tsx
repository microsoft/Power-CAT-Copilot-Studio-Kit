/**
 * LoadingSpinner - Centered Fluent UI Spinner with optional label.
 */

import React from "react";
import { makeStyles, tokens, Spinner } from "@fluentui/react-components";

export interface LoadingSpinnerProps {
  label?: string;
  size?: "tiny" | "small" | "medium" | "large";
}

const useStyles = makeStyles({
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingVerticalXXL,
    width: "100%",
  },
});

/** Centered loading spinner with optional label. */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label = "Loading...",
  size = "medium",
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <Spinner size={size} label={label} />
    </div>
  );
};

export default React.memo(LoadingSpinner);
