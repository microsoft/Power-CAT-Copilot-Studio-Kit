import { tokens } from '@fluentui/react-components';

export const REVIEW_SUMMARY_GLOW_CLASS = 'review-summary-indigo-glow';

/** Shared, one-shot emphasis for review summary cards. */
export function ReviewSummaryGlowStyles() {
  return (
    <style>{`
      @keyframes reviewSummaryIndigoGlow {
        0% {
          background-position: 200% 0;
          box-shadow: none;
          opacity: 0;
        }
        12%, 72% {
          box-shadow: 0 0 16px ${tokens.colorBrandBackground2};
          opacity: 1;
        }
        100% {
          background-position: -100% 0;
          box-shadow: none;
          opacity: 0;
        }
      }

      .${REVIEW_SUMMARY_GLOW_CLASS}::after {
        position: absolute;
        inset: -2px;
        padding: 2px;
        border-radius: inherit;
        background: linear-gradient(
          115deg,
          transparent 5%,
          ${tokens.colorBrandBackground2} 32%,
          ${tokens.colorBrandStroke2} 50%,
          ${tokens.colorBrandBackground2} 68%,
          transparent 95%
        );
        background-size: 300% 100%;
        content: "";
        pointer-events: none;
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation: reviewSummaryIndigoGlow 6s ease-in-out 1;
      }

      @media (prefers-reduced-motion: reduce) {
        .${REVIEW_SUMMARY_GLOW_CLASS}::after {
          animation: none;
          opacity: 0;
        }
      }
    `}</style>
  );
}
