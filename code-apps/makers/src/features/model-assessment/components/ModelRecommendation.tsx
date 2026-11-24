import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  CardHeader,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, SparkleRegular } from '@fluentui/react-icons';
import type {
  ModelRecommendation as Recommendation,
  RecommendationRequest,
  RecommendationVerdict,
} from '../contracts/model-recommendation';
import {
  CONFIDENCE_LABEL,
  VERDICT_LABEL,
  recommendationEvidence,
  recommendationRunNames,
  type ReadyRecommendationRequest,
} from '../contracts/recommendation-display';
import { useModelRecommendation } from '../hooks/useModelRecommendation';

const useStyles = makeStyles({
  card: { flexShrink: 0, gap: tokens.spacingVerticalS },
  headerIcon: { color: tokens.colorBrandForeground1, fontSize: tokens.fontSizeBase500 },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, minWidth: 0 },
  badges: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacingHorizontalS },
  headline: { overflowWrap: 'anywhere' },
  list: {
    margin: 0,
    paddingInlineStart: tokens.spacingHorizontalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  muted: { color: tokens.colorNeutralForeground3 },
  skeleton: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  skeletonShort: { width: '40%' },
});

type BadgeColor = 'success' | 'informative' | 'warning' | 'subtle';

const VERDICT_COLOR: Record<RecommendationVerdict, BadgeColor> = {
  A: 'success',
  B: 'success',
  equivalent: 'informative',
  neither: 'warning',
  insufficient: 'subtle',
};

const NOTICE: Partial<Record<RecommendationRequest['state'], { intent: 'info' | 'warning'; text: string }>> = {
  'mixed-kinds': {
    intent: 'info',
    text: 'Copilot Studio evaluations and Copilot Agent Kit tests score different things. Select two runs of the same type.',
  },
  'data-error': { intent: 'warning', text: 'Kit test results couldn\u2019t load, so there\u2019s no recommendation.' },
  'no-shared-checks': {
    intent: 'info',
    text: 'These runs have no test results scored in both, so there\u2019s nothing to compare.',
  },
};


function List({ items, className }: { items: string[]; className: string }) {
  return (
    <ul className={className}>
      {items.map((item, index) => <li key={index}><Body1>{item}</Body1></li>)}
    </ul>
  );
}

function Result({ request, value }: { request: ReadyRecommendationRequest; value: Recommendation }) {
  const styles = useStyles();
  const names = recommendationRunNames(request);
  const winner = value.verdict === 'A' ? names[0] : value.verdict === 'B' ? names[1] : undefined;
  return (
    <>
      <div className={styles.badges}>
        {winner && <Body1Strong>{winner}</Body1Strong>}
        <Badge appearance="tint" shape="rounded" color={VERDICT_COLOR[value.verdict]}>{VERDICT_LABEL[value.verdict]}</Badge>
        {value.verdict !== 'insufficient' && (
          <Badge appearance="outline" shape="rounded" color="informative">
            {CONFIDENCE_LABEL[value.confidence]}
          </Badge>
        )}
      </div>
      <Body1Strong className={styles.headline}>{value.headline}</Body1Strong>
      <Caption1 className={styles.muted}>{recommendationEvidence(request, names)}</Caption1>
      {value.reasons.length > 0 && <List items={value.reasons} className={styles.list} />}
      {value.tradeoffs.length > 0 && (
        <div className={styles.section}>
          <Body1Strong>Trade-offs</Body1Strong>
          <List items={value.tradeoffs} className={styles.list} />
        </div>
      )}
      {value.caveats.length > 0 && (
        <div className={styles.section}>
          <Body1Strong>Keep in mind</Body1Strong>
          <List items={value.caveats} className={styles.list} />
        </div>
      )}
    </>
  );
}

function Loading() {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Getting a model recommendation" className={styles.skeleton}>
      <SkeletonItem size={20} className={styles.skeletonShort} />
      <SkeletonItem size={16} />
      <SkeletonItem size={16} />
      <SkeletonItem size={16} />
    </Skeleton>
  );
}

export interface ModelRecommendationProps {
  request: RecommendationRequest;
}

/**
 * AI recommendation between two runs of the same kind. It runs when the dialog
 * opens and whenever the selected pair changes; each pair is asked once.
 */
export function ModelRecommendation({ request }: ModelRecommendationProps) {
  const styles = useStyles();
  const query = useModelRecommendation(request);
  const notice = NOTICE[request.state];

  let content;
  if (request.state === 'select-two') {
    content = (
      <Body1 className={styles.muted}>
        {request.selected > 2
          ? 'A recommendation compares two runs. Select two runs to get one.'
          : 'Select two completed runs to get a recommendation.'}
      </Body1>
    );
  } else if (notice) {
    content = (
      <MessageBar intent={notice.intent} layout="multiline">
        <MessageBarBody>{notice.text}</MessageBarBody>
      </MessageBar>
    );
  } else if (request.state === 'ready' && query.data && !(query.isError && query.isFetching)) {
    content = <Result request={request} value={query.data} />;
  } else if (query.isError && !query.isFetching) {
    content = (
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>Couldn&apos;t get a recommendation</MessageBarTitle>
          {query.error instanceof Error ? query.error.message : 'The AI prompt failed.'}
        </MessageBarBody>
        <MessageBarActions>
          <Button icon={<ArrowClockwiseRegular />} onClick={() => void query.refetch()}>Try again</Button>
        </MessageBarActions>
      </MessageBar>
    );
  } else {
    content = <Loading />;
  }

  const busy = request.state === 'loading' || (request.state === 'ready' && query.isFetching);
  return (
    <Card className={styles.card} appearance="outline" role="region" aria-label="Model recommendation">
      <CardHeader
        image={<SparkleRegular className={styles.headerIcon} aria-hidden />}
        header={<Subtitle2>Model recommendation</Subtitle2>}
        description={(
          <Caption1 className={styles.muted}>
            AI-generated from both runs&apos; results. Check the results before you change models.
          </Caption1>
        )}
      />
      <div className={styles.body} aria-live="polite" aria-busy={busy}>
        {content}
      </div>
    </Card>
  );
}
