import type { RefObject } from 'react';
import {
  TeachingPopover,
  TeachingPopoverBody,
  TeachingPopoverFooter,
  TeachingPopoverSurface,
  TeachingPopoverTitle,
} from '@fluentui/react-teaching-popover';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  surface: { maxWidth: '360px' },
});

export interface TourStep {
  title: string;
  body: string;
  target: RefObject<HTMLElement | null>;
  position: 'above' | 'below' | 'before' | 'after';
  align?: 'start' | 'center' | 'end';
}

export interface WelcomeTourProps {
  steps: TourStep[];
  /** 1-based step to show. */
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onDismiss: () => void;
}

/**
 * Guided tour for first-time makers, matching the Agent Review Tool's welcome tour.
 * The caller shows it only after the targets have rendered.
 */
export function WelcomeTour({ steps, currentStep, onNext, onPrevious, onDismiss }: WelcomeTourProps) {
  const styles = useStyles();

  const step = steps[currentStep - 1];
  const target = step?.target.current;
  if (!step || !target) return null;

  const first = currentStep === 1;
  const last = currentStep === steps.length;

  return (
    <TeachingPopover
      open
      positioning={{ target, position: step.position, align: step.align, offset: 12 }}
      onOpenChange={(event, data) => {
        // Outside clicks keep the tour open; Escape skips it.
        if (!data.open && (event as { key?: string }).key === 'Escape') onDismiss();
      }}
    >
      <TeachingPopoverSurface className={styles.surface} aria-label={step.title}>
        <TeachingPopoverBody>
          <TeachingPopoverTitle>{step.title}</TeachingPopoverTitle>
          {step.body}
        </TeachingPopoverBody>
        <TeachingPopoverFooter
          primary={{
            children: last ? 'Finish Tour' : `Next (${currentStep}/${steps.length})`,
            onClick: last ? onDismiss : onNext,
          }}
          secondary={{
            children: first ? 'Skip Tour' : 'Previous',
            onClick: first ? onDismiss : onPrevious,
          }}
        />
      </TeachingPopoverSurface>
    </TeachingPopover>
  );
}
