import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { getReviewContextItems } from '../../utils/reviewContext';

export interface ReviewContextDisclosureProps {
  limit: string;
  notes: string[];
}

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalS,
  },
  text: {
    color: tokens.colorNeutralForeground2,
  },
});

export function ReviewContextDisclosure({
  limit,
  notes,
}: ReviewContextDisclosureProps) {
  const styles = useStyles();
  const items = getReviewContextItems(limit, notes);

  return (
    <Accordion collapsible className={styles.root}>
      <AccordionItem value="review-context">
        <AccordionHeader size="small">Review context</AccordionHeader>
        <AccordionPanel>
          <div className={styles.content}>
            {items.map((item) => (
              <Text key={item} size={200} className={styles.text}>
                {item}
              </Text>
            ))}
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
