import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchModelId, analyzePrompt } from '../services/PromptAdvisorService';
import { parseQuickTestResponse } from '../services/ResponseParser';
import { buildCriteriaItems } from '../utils/scoring';
import { SAMPLE_PROMPTS, NUM_SAMPLES } from '../contracts/constants';
import type { AnalysisResult, PromptEvaluation, CriteriaItem, AppState } from '../contracts/types';
import { AppState as AppStateEnum } from '../contracts/types';

/** Callback the page uses to toggle panes during the analyze flow */
export type PaneToggleFn = (pane: 'evaluation' | 'tips') => void;

export interface UsePromptAdvisorReturn {
  appState: AppState;
  promptText: string;
  analysisResult: AnalysisResult | null;
  selectedPrompt: PromptEvaluation | null;
  isQuotaExceeded: boolean;
  configError: string | null;
  analysisError: string | null;
  isConfigLoading: boolean;
  isFullScreen: boolean;
  lastAnalyzedAt: Date | null;
  lastCopySuccess: boolean;
  displayedScore: number;
  displayedReasoning: string;
  criteriaItems: CriteriaItem[];
  selectedPromptText: string | null;

  setPromptText: (text: string) => void;
  analyze: () => void;
  reset: () => void;
  loadRandom: () => void;
  selectPrompt: (prompt: PromptEvaluation | null) => void;
  applyAndRefine: (prompt: PromptEvaluation) => void;
  copyPrompt: (text: string) => Promise<void>;
  toggleFullScreen: () => void;
  clearCopySuccess: () => void;
  clearError: () => void;
  setPaneToggle: (fn: PaneToggleFn) => void;
}

export function usePromptAdvisor(): UsePromptAdvisorReturn {
  const [promptText, setPromptText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptEvaluation | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null);
  const [lastCopySuccess, setLastCopySuccess] = useState(false);

  const paneToggleRef = useRef<PaneToggleFn | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Fetch AI model ID on mount
  const {
    data: modelId,
    isLoading: isConfigLoading,
    error: configErrorObj,
  } = useQuery({
    queryKey: ['prompt-advisor', 'model-id'],
    queryFn: fetchModelId,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const configError = configErrorObj ? (configErrorObj as Error).message : null;

  const mutation = useMutation({
    mutationFn: async (instruction: string) => {
      if (!modelId) throw new Error('AI model not found. Ensure Dv_PromptAdvisor_V1.0 is deployed in this environment.');
      const rawResponse = await analyzePrompt(modelId, instruction, NUM_SAMPLES);
      return parseQuickTestResponse(rawResponse);
    },
    onSuccess: (result) => {
      setAnalysisResult(result);
      setSelectedPrompt(null);
      setAnalysisError(null);
      setLastAnalyzedAt(new Date());

      if (result.inputEvaluation.confidence_score_value === 0) {
        setAnalysisResult(null);
      } else {
        paneToggleRef.current?.('evaluation');
      }
    },
    onError: (error: Error) => {
      if (error.message.includes('QuotaExceeded') || error.message.includes('EntitlementNotAvailable')) {
        setIsQuotaExceeded(true);
      } else if (error.message.includes('Failed to parse') || error.message.includes('No text output')) {
        setAnalysisError('An error occurred while processing the input. Certain language may have been filtered by the content moderation system. Please revise your prompt and try again.');
      } else {
        setAnalysisError(error.message);
      }
    },
  });

  const appState: AppState = mutation.isPending
    ? AppStateEnum.LOADING
    : analysisResult
      ? AppStateEnum.LOADED
      : AppStateEnum.NOT_LOADED;

  const displayedEvaluation = selectedPrompt ?? analysisResult?.inputEvaluation ?? null;
  const displayedScore = displayedEvaluation?.confidence_score_value ?? 0;

  const displayedReasoning = useMemo(() => {
    if (displayedEvaluation?.confidence_score_reason) return displayedEvaluation.confidence_score_reason;
    if (appState === AppStateEnum.LOADING) return 'Please wait; evaluating your prompt.';
    if (appState === AppStateEnum.LOADED) return 'Reasoning not available right now, please try again.';
    return 'Analyze a prompt to generate feedback.';
  }, [displayedEvaluation, appState]);

  const criteriaItems = useMemo(() => {
    if (!displayedEvaluation) return [];
    const items = buildCriteriaItems(displayedEvaluation);
    const hasAnyValue = items.some((item) => item.value > 0);
    return hasAnyValue ? items : [];
  }, [displayedEvaluation]);

  const analyze = useCallback(() => {
    if (!promptText.trim()) return;
    if (!modelId) {
      setAnalysisError('AI model not loaded yet. Please wait or refresh.');
      return;
    }
    setAnalysisError(null);
    paneToggleRef.current?.('tips');
    mutation.mutate(promptText.trim());
  }, [promptText, modelId, mutation]);

  const reset = useCallback(() => {
    setPromptText('');
    setAnalysisResult(null);
    setSelectedPrompt(null);
    setAnalysisError(null);
    setIsFullScreen(false);
  }, []);

  const loadRandom = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * SAMPLE_PROMPTS.length);
    setPromptText(SAMPLE_PROMPTS[randomIndex]);
  }, []);

  const applyAndRefine = useCallback(
    (prompt: PromptEvaluation) => {
      setPromptText(prompt.prompt);
      setAnalysisResult(null);
      setSelectedPrompt(null);
      setAnalysisError(null);
      if (modelId) {
        mutation.mutate(prompt.prompt);
      }
    },
    [modelId, mutation]
  );

  const copyPrompt = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setLastCopySuccess(true);
      copyTimerRef.current = setTimeout(() => setLastCopySuccess(false), 3000);
    } catch {
      setAnalysisError('Unable to copy to clipboard. Please copy manually.');
    }
  }, []);

  const clearCopySuccess = useCallback(() => {
    setLastCopySuccess(false);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const clearError = useCallback(() => {
    setAnalysisError(null);
  }, []);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  const setPaneToggle = useCallback((fn: PaneToggleFn) => {
    paneToggleRef.current = fn;
  }, []);

  return {
    appState,
    promptText,
    analysisResult,
    selectedPrompt,
    isQuotaExceeded,
    configError,
    analysisError,
    isConfigLoading,
    isFullScreen,
    lastAnalyzedAt,
    lastCopySuccess,
    displayedScore,
    displayedReasoning,
    criteriaItems,
    selectedPromptText: selectedPrompt?.prompt ?? null,
    setPromptText,
    analyze,
    reset,
    loadRandom,
    selectPrompt: setSelectedPrompt,
    applyAndRefine,
    copyPrompt,
    toggleFullScreen,
    clearCopySuccess,
    clearError,
    setPaneToggle,
  };
}
