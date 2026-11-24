/**
 * ArtifactFindingDrawer
 *
 * Shows one finding in full, in an overlay drawer.
 *
 * The citations are the point. A reader who disagrees with a finding should be
 * able to follow it back to the published rule or catalogue entry and check it,
 * rather than take the tool's word for it. The body lives in
 * {@link ArtifactFindingDetail} so it can be rendered and tested without the
 * portal-mounted Drawer.
 */
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  makeStyles,
  tokens,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { ArtifactFinding } from '../contracts/ArtifactReview';
import { ArtifactFindingDetail } from './ArtifactFindingDetail';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export interface ArtifactFindingDrawerProps {
  finding: ArtifactFinding | null;
  onDismiss: () => void;
}

export function ArtifactFindingDrawer({ finding, onDismiss }: ArtifactFindingDrawerProps) {
  const styles = useStyles();
  // Findings open from grid rows rather than a DialogTrigger, so Tabster has no
  // restorer history of its own. This half marks the drawer as the source; the
  // matching `useRestoreFocusTarget` on each finding trigger (ArtifactResultsPanel
  // and ArtifactFilesExplorer) marks where focus goes back to. Both halves are
  // needed — a source with no target still drops focus to <body>.
  const restoreFocus = useRestoreFocusSource();

  return (
    <Drawer
      type="overlay"
      position="end"
      separator
      open={finding !== null}
      onOpenChange={() => onDismiss()}
      size="medium"
      {...restoreFocus}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              aria-label="Close finding details"
              icon={<DismissRegular />}
              onClick={onDismiss}
            />
          }
        >
          {finding?.title ?? 'Finding'}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody className={styles.body}>
        {finding && <ArtifactFindingDetail finding={finding} />}
      </DrawerBody>
    </Drawer>
  );
}
