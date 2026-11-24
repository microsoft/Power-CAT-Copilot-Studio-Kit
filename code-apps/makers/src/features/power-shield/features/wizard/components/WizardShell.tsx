import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { Button, makeStyles, mergeClasses, MessageBar, MessageBarBody, Spinner, tokens, Text } from '@fluentui/react-components';
import {
  Globe20Regular,
  ClipboardTask20Regular,
  PlugConnected20Regular,
  DocumentText20Regular,
  CheckmarkCircle20Regular,
  CheckmarkCircle20Filled,
} from '@fluentui/react-icons';
import { WizardContextProvider, useWizard } from '../contexts/WizardContext';
import { useNavigateAwayGuard } from '../../../shared/hooks/useNavigateAwayGuard';
import { loadDraft, loadAsTemplate } from '../../../shared/services/dataverse/wizardDraftService';
import { hasActiveQuestions } from '../../../shared/services/dataverse/questionService';
import { useLayoutStyles, useSurfaceStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  cardMaxWidth: {
    maxWidth: '1400px',
  },
  // Step indicator bar
  stepper: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stepWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
  },
  stepCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: '2px',
    borderRightWidth: '2px',
    borderBottomWidth: '2px',
    borderLeftWidth: '2px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
    boxSizing: 'border-box',
  },
  stepCircleActive: {
    borderTopColor: tokens.colorBrandBackground,
    borderRightColor: tokens.colorBrandBackground,
    borderBottomColor: tokens.colorBrandBackground,
    borderLeftColor: tokens.colorBrandBackground,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCircleCompleted: {
    borderTopColor: tokens.colorPaletteGreenForeground2,
    borderRightColor: tokens.colorPaletteGreenForeground2,
    borderBottomColor: tokens.colorPaletteGreenForeground2,
    borderLeftColor: tokens.colorPaletteGreenForeground2,
    backgroundColor: tokens.colorPaletteGreenForeground2,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepClickable: {
    cursor: 'pointer',
    ':hover': {
      transform: 'scale(1.1)',
      borderTopColor: tokens.colorPaletteGreenForeground2,
      borderRightColor: tokens.colorPaletteGreenForeground2,
      borderBottomColor: tokens.colorPaletteGreenForeground2,
      borderLeftColor: tokens.colorPaletteGreenForeground2,
    },
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    maxWidth: '90px',
    lineHeight: tokens.lineHeightBase200,
  },
  stepLabelActive: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepLabelClickable: {
    cursor: 'pointer',
  },
  stepButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
    backgroundColor: 'transparent',
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    paddingTop: '0',
    paddingRight: '0',
    paddingBottom: '0',
    paddingLeft: '0',
  },
  // Horizontal line connecting step circles
  connector: {
    flex: '1 0 12px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
    marginTop: '20px', // half of 40px circle — aligns connector with circle center
  },
  connectorActive: {
    backgroundColor: tokens.colorBrandBackground,
  },
  content: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    flex: '1',
  },
  loadingCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXXL,
  },
  errorCenter: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXXL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Step config
// ─────────────────────────────────────────────────────────────────────────────

interface StepDef {
  number: number;
  label: string;
  path: string;
  Icon: typeof Globe20Regular;
}

const ALL_STEPS: StepDef[] = [
  { number: 1, label: 'Team & Environments', path: '/new-request/environment', Icon: Globe20Regular },
  { number: 2, label: 'Questionnaire', path: '/new-request/questionnaire', Icon: ClipboardTask20Regular },
  { number: 3, label: 'Connectors', path: '/new-request/connectors', Icon: PlugConnected20Regular },
  { number: 4, label: 'Justification', path: '/new-request/justification', Icon: DocumentText20Regular },
  { number: 5, label: 'Review & Submit', path: '/new-request/review', Icon: CheckmarkCircle20Regular },
];

/** Build the visible steps list, excluding Questionnaire when no questions configured. */
function buildSteps(hasQuestionnaire: boolean): StepDef[] {
  const filtered = hasQuestionnaire
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.label !== 'Questionnaire');
  return filtered.map((s, i) => ({ ...s, number: i + 1 }));
}

function getCurrentStepIndex(pathname: string, steps: StepDef[]): number {
  return steps.findIndex((s) => pathname.endsWith(s.path));
}

/** Map highestCompletedStep to the path the user should resume at. */
function getResumeStepPath(highestCompletedStep: number, steps: StepDef[]): string {
  const idx = Math.min(highestCompletedStep, steps.length - 1);
  return steps[idx]?.path ?? '/new-request/environment';
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner shell (inside WizardContext)
// ─────────────────────────────────────────────────────────────────────────────

function WizardShellInner() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const surfaceStyles = useSurfaceStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, dispatch } = useWizard();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [loadDraftError, setLoadDraftError] = useState<string | null>(null);
  const loadedTemplateId = useRef<string | null>(null);

  // Fetch questionnaire availability on mount
  useEffect(() => {
    if (state.hasQuestionnaire !== null) return;
    hasActiveQuestions()
      .then((has) => dispatch({ type: 'SET_HAS_QUESTIONNAIRE', payload: has }))
      .catch(() => dispatch({ type: 'SET_HAS_QUESTIONNAIRE', payload: false }));
  }, [state.hasQuestionnaire, dispatch]);

  const steps = useMemo(
    () => buildSteps(state.hasQuestionnaire ?? true),
    [state.hasQuestionnaire],
  );

  const currentStepIndex = getCurrentStepIndex(location.pathname, steps);
  const currentStep = currentStepIndex + 1;

  // Draft loading: when navigating with draftRequestId in router state,
  // fetch the draft from Dataverse and dispatch LOAD_DRAFT.
  useEffect(() => {
    const locState = location.state as { draftRequestId?: string } | null;
    const draftId = locState?.draftRequestId;

    // Only load if draftId is present AND we haven't already loaded this draft
    if (!draftId || state.draftRequestId === draftId) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingDraft(true);
    setLoadDraftError(null);

    // Resolve questionnaire availability first so loadDraft can compute
    // highestCompletedStep using the correct step layout (4-step vs 5-step).
    hasActiveQuestions()
      .catch(() => false)
      .then((hasQ) => {
        if (cancelled) return undefined;
        return loadDraft(draftId, hasQ).then((draftState) => ({ draftState, hasQ }));
      })
      .then((result) => {
        if (cancelled || !result) return;
        const { draftState, hasQ } = result;
        draftState.hasQuestionnaire = hasQ;
        dispatch({ type: 'LOAD_DRAFT', payload: draftState });
        // Build steps from the fresh questionnaire result
        const freshSteps = buildSteps(hasQ);
        const resumePath = getResumeStepPath(draftState.highestCompletedStep, freshSteps);
        navigate(resumePath, { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadDraftError(err instanceof Error ? err.message : 'Failed to load draft.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDraft(false);
      });

    return () => { cancelled = true; };
  }, [location.state, state.draftRequestId, dispatch, navigate]);

  // Template loading: when navigating with templateRequestId in router state (Resubmit flow),
  // fetch the source request and pre-populate the wizard as a new (unsaved) request.
  useEffect(() => {
    const locState = location.state as { templateRequestId?: string } | null;
    const templateId = locState?.templateRequestId;

    // Only load if templateId is present AND not already loaded
    if (!templateId || loadedTemplateId.current === templateId) return;

    let cancelled = false;
    setIsLoadingDraft(true);
    setLoadDraftError(null);

    // Fetch template data and questionnaire availability in parallel so
    // hasQuestionnaire is resolved immediately (avoids brief spinner flash).
    Promise.all([loadAsTemplate(templateId), hasActiveQuestions()])
      .then(([templateState, hasQ]) => {
        if (cancelled) return;
        loadedTemplateId.current = templateId;
        templateState.hasQuestionnaire = hasQ;
        dispatch({ type: 'LOAD_DRAFT', payload: templateState });
        // Always start at Step 1 so the user can review and correct their selections
        navigate('/new-request/environment', { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadDraftError(err instanceof Error ? err.message : 'Failed to load request for resubmit.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDraft(false);
      });

    return () => { cancelled = true; };
  }, [location.state, dispatch, navigate]);

  // Guard: prevent deep-linking past completed steps
  useEffect(() => {
    if (isLoadingDraft) return; // Skip guard while draft is loading
    console.log('[WizardShell] guard check — currentStepIndex:', currentStepIndex, '| highestCompletedStep:', state.highestCompletedStep, '| pathname:', location.pathname);
    if (currentStepIndex > 0 && state.highestCompletedStep < currentStepIndex) {
      console.warn('[WizardShell] guard triggered — redirecting to Step 1 (highestCompletedStep too low)');
      navigate('/new-request/environment', { replace: true });
    }
  }, [currentStepIndex, state.highestCompletedStep, navigate, isLoadingDraft, location.pathname]);

  // Focus heading after navigation for accessibility
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [location.pathname]);

  const isDirty = state.highestCompletedStep > 0;
  // Guard against accidental tab-close while wizard has unsaved progress.
  useNavigateAwayGuard(isDirty);

  // Show spinner while resolving questionnaire availability
  if (state.hasQuestionnaire === null) {
    return (
      <div className={layoutStyles.wizardBackground}>
        <div className={mergeClasses(surfaceStyles.elevatedCard, styles.cardMaxWidth)}>
          <div className={styles.loadingCenter}>
            <Spinner label="Loading wizard..." />
          </div>
        </div>
      </div>
    );
  }

  // Render loading state while fetching draft
  if (isLoadingDraft) {
    return (
      <div className={layoutStyles.wizardBackground}>
        <div className={mergeClasses(surfaceStyles.elevatedCard, styles.cardMaxWidth)}>
          <div className={styles.loadingCenter}>
            <Spinner label="Loading draft..." />
          </div>
        </div>
      </div>
    );
  }

  // Render error state if draft loading failed
  if (loadDraftError) {
    return (
      <div className={layoutStyles.wizardBackground}>
        <div className={mergeClasses(surfaceStyles.elevatedCard, styles.cardMaxWidth)}>
          <div className={styles.errorCenter}>
            <MessageBar intent="error">
              <MessageBarBody>{loadDraftError}</MessageBarBody>
            </MessageBar>
            <Button appearance="primary" onClick={() => navigate('/', { state: { bypassGuard: true } })}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={layoutStyles.wizardBackground}>
      <div className={mergeClasses(surfaceStyles.elevatedCard, styles.cardMaxWidth)}>
        {/* Step indicators: icon circles + horizontal connector lines */}
        <div className={styles.stepper} role="list" aria-label="Wizard steps">
          {steps.map((step, index) => {
            const isActive = step.number === currentStep;
            const isCompleted = step.number < currentStep;
            const isClickable = step.number <= state.highestCompletedStep && !isActive;
            const prevStepCompleted = index > 0 && steps[index - 1].number < currentStep;

            const circleClassName = mergeClasses(
              styles.stepCircle,
              isActive && styles.stepCircleActive,
              isCompleted && styles.stepCircleCompleted,
              isClickable && styles.stepClickable,
            );

            const labelClassName = mergeClasses(
              styles.stepLabel,
              isActive && styles.stepLabelActive,
              isClickable && styles.stepLabelClickable,
            );

            const ariaLabel = `Step ${step.number}: ${step.label}${
              isCompleted ? ' (completed, click to navigate)' : isActive ? ' (current)' : ''
            }`;

            const handleStepClick = () => {
              if (!isClickable) return;
              navigate(step.path);
            };

            const stepContent = (
              <>
                <div
                  className={circleClassName}
                  aria-current={isActive ? 'step' : undefined}
                  {...(!isClickable ? { 'aria-label': ariaLabel } : {})}
                >
                  {isCompleted ? <CheckmarkCircle20Filled /> : <step.Icon />}
                </div>
                <Text className={labelClassName}>
                  {step.label}
                </Text>
              </>
            );

            return (
              <Fragment key={step.number}>
                {index > 0 && (
                  <div
                    className={mergeClasses(
                      styles.connector,
                      prevStepCompleted && styles.connectorActive,
                    )}
                    aria-hidden="true"
                  />
                )}
                {isClickable ? (
                  <button
                    className={styles.stepButton}
                    role="listitem"
                    aria-label={ariaLabel}
                    onClick={handleStepClick}
                  >
                    {stepContent}
                  </button>
                ) : (
                  <div
                    className={styles.stepWrapper}
                    role="listitem"
                    aria-label={ariaLabel}
                  >
                    {stepContent}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export — wraps with WizardContextProvider
// ─────────────────────────────────────────────────────────────────────────────

export function WizardShell() {
  return (
    <WizardContextProvider>
      <WizardShellInner />
    </WizardContextProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { useWizard };
