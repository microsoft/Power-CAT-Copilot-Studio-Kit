import { useCallback } from 'react';
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

const LS_TOUR_SEEN_KEY = 'powershield-st-tour-seen';

const useStyles = makeStyles({
  surface: {
    width: '340px',
  },
});

const TOUR_STEPS = [
  {
    id: 'step-1',
    title: 'What is this?',
    body: 'Service Trees represent organizational units or departments in your company. They are a prerequisite for creating policy requests - each request must be associated with a Service Tree.',
  },
  {
    id: 'step-2',
    title: 'Service Tree & Members',
    body: 'Click any Service Tree name to open its detail view. There you can edit its name, organization, and description. You can also manage team members - only members of a Service Tree can submit policy requests under it.',
  },
  {
    id: 'step-3',
    title: 'Environment Containers',
    body: 'Inside each Service Tree, switch to the "Environment Containers" tab to group Dataverse environments into containers. When creating a policy request, you\'ll select a container to define which environments the policy applies to.',
  },
];

export function ServiceTreeTour() {
  const styles = useStyles();
  const defaultOpen = localStorage.getItem(LS_TOUR_SEEN_KEY) !== 'true';

  const handleOpenChange = useCallback((_: unknown, data: { open: boolean }) => {
    if (!data.open) {
      localStorage.setItem(LS_TOUR_SEEN_KEY, 'true');
    }
  }, []);

  return (
    <TeachingPopover
      defaultOpen={defaultOpen}
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
