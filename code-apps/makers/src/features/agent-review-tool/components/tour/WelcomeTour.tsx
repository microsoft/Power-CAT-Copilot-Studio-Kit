/**
 * WelcomeTour Component
 *
 * 3-step guided tour for first-time users using TeachingPopover.
 * Based on ui-specification.md Section 3 (Welcome Tour).
 *
 * Steps:
 * 1. Quick Stats Dashboard (below stats)
 * 2. Review Button (after/right of review button)
 * 3. View Button (above view button)
 */

import { useState, useEffect } from 'react';
import {
  TeachingPopover,
  TeachingPopoverSurface,
  TeachingPopoverBody,
  TeachingPopoverTitle,
  TeachingPopoverFooter,
} from '@fluentui/react-teaching-popover';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  surface: {
    maxWidth: '360px',
  },
});

export interface WelcomeTourProps {
  /** Current step (1, 2, or 3) */
  currentStep: number;
  /** Callback when Next button is clicked */
  onNext: () => void;
  /** Callback when Previous button is clicked */
  onPrevious: () => void;
  /** Callback when tour is dismissed (Skip/Finish) */
  onDismiss: () => void;
  /** Ref to Quick Stats section (Step 1 target) */
  quickStatsRef: React.RefObject<HTMLElement | null>;
  /** Ref to Review button (Step 2 target) */
  reviewButtonRef: React.RefObject<HTMLElement | null>;
  /** Ref to View button (Step 3 target) */
  viewButtonRef: React.RefObject<HTMLElement | null>;
}

interface TourStep {
  title: string;
  body: string;
  target: React.RefObject<HTMLElement | null> | null;
  position: 'above' | 'below' | 'before' | 'after';
  primaryButton: { label: string };
  secondaryButton?: { label: string };
}

/**
 * WelcomeTour Component
 *
 * Displays a 3-step guided tour for first-time users using TeachingPopover.
 *
 * @example
 * ```tsx
 * const [currentStep, setCurrentStep] = useState(1);
 * const quickStatsRef = useRef<HTMLDivElement>(null);
 * const reviewButtonRef = useRef<HTMLButtonElement>(null);
 * const viewButtonRef = useRef<HTMLButtonElement>(null);
 *
 * <WelcomeTour
 *   currentStep={currentStep}
 *   onNext={() => setCurrentStep(currentStep + 1)}
 *   onPrevious={() => setCurrentStep(currentStep - 1)}
 *   onDismiss={() => setShowTour(false)}
 *   quickStatsRef={quickStatsRef}
 *   reviewButtonRef={reviewButtonRef}
 *   viewButtonRef={viewButtonRef}
 * />
 * ```
 */
export function WelcomeTour({
  currentStep,
  onNext,
  onPrevious,
  onDismiss,
  quickStatsRef,
  reviewButtonRef,
  viewButtonRef,
}: WelcomeTourProps) {
  const styles = useStyles();

  // Force re-render after mount so that refs are populated before the tour renders.
  // Refs are assigned by React after the DOM paints, so on the first render cycle
  // ref.current is null even if the target element is already in the DOM.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    forceUpdate(1);
  }, []);

  const steps: TourStep[] = [
    {
      title: 'Quick Stats Dashboard',
      body: 'Monitor agent quality at a glance. Track total agents you own, reviewed agents, average quality scores, and total issues found across reviewed agents.',
      target: quickStatsRef,
      position: 'below',
      primaryButton: { label: 'Next (1/3)' },
      secondaryButton: { label: 'Skip Tour' },
    },
    {
      title: 'Start a Review',
      body: "Click the Review button to analyze an agent's configuration, detect anti-patterns, and get AI-powered recommendations. Reviews are saved automatically.",
      target: reviewButtonRef,
      position: 'after',
      primaryButton: { label: 'Next (2/3)' },
      secondaryButton: { label: 'Previous' },
    },
    {
      title: 'View Results & Export',
      body: 'After reviewing an agent, click View to see the detailed report. You can download PDF reports for stakeholders or SARIF files for DevOps integration using the split button in the dialog.',
      target: viewButtonRef,
      position: 'above',
      primaryButton: { label: 'Finish Tour' },
      secondaryButton: { label: 'Previous' },
    },
  ];

  const step = steps[currentStep - 1];
  if (!step) return null;

  // Only render if target element exists
  if (!step.target?.current) return null;

  const handlePrimaryClick = () => {
    if (currentStep === 3) {
      onDismiss(); // Finish tour
    } else {
      onNext();
    }
  };

  const handleSecondaryClick = () => {
    if (currentStep === 1) {
      onDismiss(); // Skip tour
    } else {
      onPrevious();
    }
  };

  return (
    <TeachingPopover
      open={true}
      positioning={{
        target: step.target.current,
        position: step.position,
        offset: 12,
      }}
      onOpenChange={() => {
        // Prevent closing by clicking outside
      }}
    >
      <TeachingPopoverSurface className={styles.surface}>
        <TeachingPopoverBody>
          <TeachingPopoverTitle>{step.title}</TeachingPopoverTitle>
          {step.body}
        </TeachingPopoverBody>
        <TeachingPopoverFooter
          primary={{ children: step.primaryButton.label, onClick: handlePrimaryClick }}
          secondary={
            step.secondaryButton
              ? { children: step.secondaryButton.label, onClick: handleSecondaryClick }
              : undefined
          }
        />
      </TeachingPopoverSurface>
    </TeachingPopover>
  );
}
