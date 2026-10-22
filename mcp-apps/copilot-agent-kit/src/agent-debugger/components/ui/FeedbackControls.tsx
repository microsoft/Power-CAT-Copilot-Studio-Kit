import type { FC } from "react";
import {
  Text,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  ThumbLike20Regular,
  ThumbLike20Filled,
  ThumbDislike20Regular,
  ThumbDislike20Filled,
} from "@fluentui/react-icons";
import type { FeedbackData } from "./types";

const useStyles = makeStyles({
  feedbackControls: {
    display: "flex",
    flexDirection: "column",
    marginTop: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  feedbackButtons: {
    display: "flex",
    gap: tokens.spacingHorizontalXXS,
  },
  feedbackIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    cursor: "default",
  },
  feedbackIconActive: {
    color: tokens.colorBrandForeground1,
  },
  feedbackForm: {
    marginTop: tokens.spacingVerticalS,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  feedbackLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  feedbackTextarea: {
    resize: "none",
    minHeight: "60px",
  },
  feedbackTextDisplay: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  formActions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    justifyContent: "flex-end",
  },
  ratingContainer: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    marginTop: tokens.spacingVerticalXXS,
    fontSize: tokens.fontSizeBase200,
  },
  starFilled: {
    color: tokens.colorPaletteYellowForeground1,
  },
  starEmpty: {
    color: tokens.colorNeutralForeground4,
  },
});

interface FeedbackControlsProps {
  feedback?: FeedbackData | null;
}

const FeedbackControls: FC<FeedbackControlsProps> = ({ feedback }) => {
  const styles = useStyles();

  const hasThumbsUp = feedback?.reaction === "thumbsUp";
  const hasThumbsDown = feedback?.reaction === "thumbsDown";
  const hasFeedbackText = feedback?.feedback?.text || feedback?.comment;

  return (
    <div className={styles.feedbackControls}>
      {/* Thumbs up/down buttons */}
      <div className={styles.feedbackButtons}>
        <span
          role="img"
          className={`${styles.feedbackIcon} ${
            hasThumbsUp ? styles.feedbackIconActive : ""
          }`}
          aria-label={hasThumbsUp ? "Liked" : "Like"}
        >
          {hasThumbsUp ? <ThumbLike20Filled /> : <ThumbLike20Regular />}
        </span>
        <span
          role="img"
          className={`${styles.feedbackIcon} ${
            hasThumbsDown ? styles.feedbackIconActive : ""
          }`}
          aria-label={hasThumbsDown ? "Disliked" : "Dislike"}
        >
          {hasThumbsDown ? <ThumbDislike20Filled /> : <ThumbDislike20Regular />}
        </span>
      </div>

      {/* Feedback form - only show if there's existing feedback text */}
      {hasFeedbackText && (
        <div className={styles.feedbackForm}>
          <Text className={styles.feedbackLabel}>
            Tell us about your experience
          </Text>
          <div className={styles.feedbackTextDisplay}>
            {feedback?.feedback?.text || feedback?.comment || ""}
          </div>
        </div>
      )}

      {/* Rating display if feedback has rating */}
      {feedback?.feedback?.rating && (
        <div
          className={styles.ratingContainer}
          role="img"
          aria-label={`Rating: ${feedback.feedback?.rating} out of 5`}
        >
          <Text size={200}>Rating:</Text>
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              aria-hidden="true"
              className={
                star <= (feedback.feedback?.rating || 0)
                  ? styles.starFilled
                  : styles.starEmpty
              }
            >
              ★
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeedbackControls;
