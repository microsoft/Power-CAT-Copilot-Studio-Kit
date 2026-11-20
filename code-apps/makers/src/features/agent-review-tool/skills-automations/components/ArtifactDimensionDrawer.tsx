import {
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { RubricDimensionScore } from '../contracts/ArtifactReview';
import { RUBRIC_DIMENSION_LABELS } from '../contracts/ArtifactReview';
import { ArtifactDimensionDetail } from './ArtifactDimensionDetail';

export interface ArtifactDimensionDrawerProps {
  dimension: RubricDimensionScore | null;
  onDismiss: () => void;
}

/** Shows rubric detail in an overlay when the fixed summary rail is unavailable. */
export function ArtifactDimensionDrawer({
  dimension,
  onDismiss,
}: ArtifactDimensionDrawerProps) {
  const restoreFocus = useRestoreFocusSource();

  return (
    <Drawer
      type="overlay"
      position="end"
      separator
      open={dimension !== null}
      onOpenChange={() => onDismiss()}
      size="medium"
      {...restoreFocus}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              aria-label="Close rubric dimension details"
              icon={<DismissRegular />}
              onClick={onDismiss}
            />
          }
        >
          {dimension ? RUBRIC_DIMENSION_LABELS[dimension.id] : 'Rubric dimension'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {dimension && <ArtifactDimensionDetail dimension={dimension} />}
      </DrawerBody>
    </Drawer>
  );
}
