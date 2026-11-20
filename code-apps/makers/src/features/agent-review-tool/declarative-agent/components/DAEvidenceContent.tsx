import { Fragment } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Body1,
  Text,
  makeStyles,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';
import { useStandardFindingContentStyles } from '../../components/review-page/standardFindingContentStyles';

const useStyles = makeStyles({
  fields: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  fieldName: {
    ...typographyStyles.body1Strong,
    overflowWrap: 'anywhere',
  },
  fieldValue: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  list: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  text: {
    display: 'block',
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

function EvidenceValue({ value, depth }: { value: unknown; depth: number }) {
  const styles = useStyles();
  if (value === null || typeof value !== 'object') {
    return (
      <Body1 className={styles.text}>
        {value === '' ? '""' : String(value)}
      </Body1>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0 || depth >= 3 || entries.length > 12) {
    return (
      <Text as="pre" font="monospace" className={styles.text}>
        {JSON.stringify(value, null, 2)}
      </Text>
    );
  }

  if (Array.isArray(value)) {
    return (
      <ol className={styles.list}>
        {value.map((entry: unknown, index) => (
          <li key={index}>
            <EvidenceValue value={entry} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <dl className={styles.fields}>
      {entries.map(([name, entry]) => (
        <Fragment key={name}>
          <dt className={styles.fieldName}>{name}</dt>
          <dd className={styles.fieldValue}>
            <EvidenceValue value={entry} depth={depth + 1} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Formats recorded JSON as fields and lists; other evidence stays unchanged. */
export function DAEvidenceContent({ evidence }: { evidence: string }) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  let value: unknown;
  try {
    value = JSON.parse(evidence, (_key, entry: unknown) => {
      if (typeof entry === 'number' && (
        !Number.isFinite(entry) || (Number.isInteger(entry) && !Number.isSafeInteger(entry))
      )) {
        throw new RangeError('The recorded number cannot be displayed without loss.');
      }
      return entry;
    });
    // Very deep recorded JSON may parse but exceed the formatter's stack.
    if (typeof value === 'object') JSON.stringify(value);
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof RangeError)) throw error;
    return <Body1 className={styles.text}>{evidence}</Body1>;
  }

  if (value === null || typeof value !== 'object') {
    return <Body1 className={styles.text}>{evidence}</Body1>;
  }

  return (
    <>
      <EvidenceValue value={value} depth={0} />
      <Accordion collapsible className={shared.reviewAccordion}>
        <AccordionItem value="original-evidence">
          <AccordionHeader
            as="h6"
            expandIconPosition="end"
            button={{ className: shared.reviewHeader }}
          >
            Original evidence
          </AccordionHeader>
          <AccordionPanel className={shared.reviewPanel}>
            <Text as="pre" font="monospace" className={styles.text}>{evidence}</Text>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
}
