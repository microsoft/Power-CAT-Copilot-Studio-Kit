import { useCallback, useEffect, useState } from 'react';
import {
  TeachingPopover,
  TeachingPopoverTrigger,
  TeachingPopoverSurface,
  TeachingPopoverHeader,
  TeachingPopoverBody,
  TeachingPopoverCarousel,
  TeachingPopoverCarouselCard,
  TeachingPopoverCarouselFooter,
  TeachingPopoverCarouselNav,
  TeachingPopoverCarouselNavButton,
  Button,
  makeStyles,
} from '@fluentui/react-components';
import { CompassNorthwestRegular } from '@fluentui/react-icons';

const LS_TOUR_SEEN_KEY = 'powershield-qc-tour-seen';

const useStyles = makeStyles({
  surface: {
    width: '340px',
  },
});

const TOUR_STEPS = [
  {
    id: 'step-1',
    title: 'What is this?',
    body: 'This is where you set up the compliance questionnaire. The questions you configure here will be presented to makers in Step 2 when they submit a connector access request. Their answers help you make informed approval decisions.',
  },
  {
    id: 'step-2',
    title: 'How it works',
    body: 'Questions are organized into categories. Create categories first, then click into each one to add questions. You can set answer types like Yes/No, text fields, dropdowns, or date pickers - and make questions conditional based on previous answers.',
  },
  {
    id: 'step-3',
    title: 'Answer Options',
    body: 'For dropdown and multi-select questions, click into a question to manage its answer options directly. Once configured, the full questionnaire appears automatically in the request wizard.',
  },
];

export function QuestionConfigTour() {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_TOUR_SEEN_KEY) !== 'true') {
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  const handleOpenChange = useCallback((_: unknown, data: { open: boolean }) => {
    setOpen(data.open);
    if (!data.open) {
      localStorage.setItem(LS_TOUR_SEEN_KEY, 'true');
    }
  }, []);

  return (
    <TeachingPopover
      open={open}
      onOpenChange={handleOpenChange}
      withArrow
    >
      <TeachingPopoverTrigger>
        <Button
          appearance="subtle"
          size="small"
          icon={<CompassNorthwestRegular />}
        >
          Take a tour
        </Button>
      </TeachingPopoverTrigger>

      <TeachingPopoverSurface className={styles.surface}>
        <TeachingPopoverCarousel defaultValue={TOUR_STEPS[0].id}>
          {TOUR_STEPS.map((step) => (
            <TeachingPopoverCarouselCard key={step.id} value={step.id}>
              <TeachingPopoverHeader>{step.title}</TeachingPopoverHeader>
              <TeachingPopoverBody>{step.body}</TeachingPopoverBody>
            </TeachingPopoverCarouselCard>
          ))}

          <TeachingPopoverCarouselFooter
            next="Next"
            previous="Previous"
            initialStepText="Close"
            finalStepText="Got it!"
          >
            <TeachingPopoverCarouselNav>
              {() => <TeachingPopoverCarouselNavButton />}
            </TeachingPopoverCarouselNav>
          </TeachingPopoverCarouselFooter>
        </TeachingPopoverCarousel>
      </TeachingPopoverSurface>
    </TeachingPopover>
  );
}
