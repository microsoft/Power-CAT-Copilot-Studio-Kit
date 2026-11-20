/**
 * ReviewErrorContent
 *
 * Shared error presentation for the review progress dialogs (CS + DA).
 *
 * Rendered as plain dialog content — NOT a MessageBar. The dialog already
 * signals the error state (red title icon, red progress bar, failed stage),
 * so an additional alert box would be redundant. This shows a bold error
 * heading + friendly message, an optional "Learn more" link, and a collapsible
 * "Show technical details" area for diagnostic text useful to support.
 */

import {
  Link,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  title: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  message: {
    color: tokens.colorNeutralForeground1,
  },
  learnMore: {
    marginTop: '2px',
    alignSelf: 'flex-start',
  },
  detailAccordion: {
    marginTop: '2px',
  },
  detailText: {
    display: 'block',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
});

export interface ReviewErrorContentProps {
  /** Short error heading (e.g. "AI capacity not available"). */
  title: string;
  /** Friendly, customer-facing message body. */
  message: string;
  /** Optional docs URL surfaced as a "Learn more" link. */
  learnMoreUrl?: string;
  /** Optional raw/technical detail shown in a collapsible "Show details" area. */
  technicalDetail?: string;
}

/**
 * ReviewErrorContent component.
 *
 * @example
 * ```tsx
 * <ReviewErrorContent
 *   title="AI capacity not available"
 *   message="This environment doesn't have the AI capacity required..."
 *   learnMoreUrl="https://learn.microsoft.com/..."
 *   technicalDetail="No capacity was found."
 * />
 * ```
 */
export function ReviewErrorContent({
  title,
  message,
  learnMoreUrl,
  technicalDetail,
}: ReviewErrorContentProps) {
  const styles = useStyles();

  return (
    <div className={styles.wrapper} role="alert">
      <Text size={300} className={styles.title}>{title}</Text>
      <Text size={200} className={styles.message}>{message}</Text>

      {learnMoreUrl && (
        <Link
          className={styles.learnMore}
          href={learnMoreUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <OpenRegular style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          Learn more
        </Link>
      )}

      {technicalDetail && (
        <Accordion collapsible className={styles.detailAccordion}>
          <AccordionItem value="details">
            <AccordionHeader size="small">Show technical details</AccordionHeader>
            <AccordionPanel>
              <Text className={styles.detailText}>{technicalDetail}</Text>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
