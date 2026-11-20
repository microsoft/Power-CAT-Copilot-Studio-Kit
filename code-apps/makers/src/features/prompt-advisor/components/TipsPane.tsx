import { useState } from 'react';
import {
  Card, CardHeader, Body1Strong, Body1, Button,
  makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Lightbulb20Regular, ChevronUp20Regular, ChevronDown20Regular,
  ChevronLeft20Regular, ChevronRight20Regular, Document20Regular,
} from '@fluentui/react-icons';
import { PROMPT_TIPS } from '../contracts/tips';

const useStyles = makeStyles({
  headerAction: {
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: '4px',
    paddingTop: '4px',
  },
  tipHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  icon: {
    color: tokens.colorBrandForeground1,
  },
  description: {
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase300,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalSNudge,
    flex: 1,
    justifyContent: 'center',
  },
  dot: {
    width: '8px',
    height: '8px',
    minWidth: '8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralStroke2,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    appearance: 'none',
  },
  dotActive: {
    width: '8px',
    height: '8px',
    minWidth: '8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    appearance: 'none',
  },
});

interface TipsPaneProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export function TipsPane({ isExpanded, onToggle }: TipsPaneProps) {
  const styles = useStyles();
  const [currentIndex, setCurrentIndex] = useState(() => Math.floor(Math.random() * PROMPT_TIPS.length));

  const tip = PROMPT_TIPS[currentIndex];

  const goNext = () => setCurrentIndex((i) => (i + 1) % PROMPT_TIPS.length);
  const goPrev = () => setCurrentIndex((i) => (i - 1 + PROMPT_TIPS.length) % PROMPT_TIPS.length);

  return (
    <Card size="large">
      <CardHeader
        header={
          <div className={styles.headerTitle}>
            <Document20Regular />
            <Body1Strong>Tips</Body1Strong>
          </div>
        }
        action={
          <div className={styles.headerAction}>
            <Button
              appearance="transparent"
              icon={isExpanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
              onClick={onToggle}
              aria-label={isExpanded ? 'Collapse tips' : 'Expand tips'}
              size="small"
            />
          </div>
        }
      />
      {isExpanded && (
        <>
          <div className={styles.content}>
            <div className={styles.tipHeader}>
              <Lightbulb20Regular className={styles.icon} />
              <Body1Strong>{tip.fact}</Body1Strong>
            </div>
            <Body1 className={styles.description}>{tip.description}</Body1>
          </div>
          <div className={styles.pagination}>
            <Button
              appearance="transparent"
              icon={<ChevronLeft20Regular />}
              size="small"
              onClick={goPrev}
              aria-label="Previous tip"
            />
            <div className={styles.dots} role="tablist" aria-label="Tips navigation">
              {PROMPT_TIPS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  className={idx === currentIndex ? styles.dotActive : styles.dot}
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Tip ${idx + 1}`}
                  aria-selected={idx === currentIndex}
                />
              ))}
            </div>
            <Button
              appearance="transparent"
              icon={<ChevronRight20Regular />}
              size="small"
              onClick={goNext}
              aria-label="Next tip"
            />
          </div>
        </>
      )}
    </Card>
  );
}
