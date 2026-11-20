import { useEffect } from 'react';
import {
  getQuestions,
  getQuestionCategories,
  getQuestionOptions,
} from '../../../shared/services/dataverse/questionService';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { Question, QuestionCategory, QuestionOption } from '../../../models/question';

export interface QuestionsState {
  questions: Question[];
  categories: QuestionCategory[];
  /** Options keyed by questionId for O(1) lookup in the component */
  optionsByQuestionId: Map<string, QuestionOption[]>;
  isLoading: boolean;
  error: string | null;
}

async function fetchAllQuestionnaireData() {
  const [questions, categories, options] = await Promise.all([
    getQuestions(),
    getQuestionCategories(),
    getQuestionOptions(),
  ]);

  console.log('[useQuestions] fetchAllQuestionnaireData summary:', {
    questionsCount: questions.length,
    categoriesCount: categories.length,
    optionsCount: options.length,
    questions,
    categories,
    options,
  });

  const optionsByQuestionId = new Map<string, QuestionOption[]>();
  for (const opt of options) {
    const key = opt.questionId.toLowerCase();
    const bucket = optionsByQuestionId.get(key);
    if (bucket) {
      bucket.push(opt);
    } else {
      optionsByQuestionId.set(key, [opt]);
    }
  }

  return { questions, categories, optionsByQuestionId };
}

/**
 * Fetches questions, categories, and options for wizard Step 2 in parallel.
 * Options are pre-grouped by questionId for efficient lookup in the component.
 */
export function useQuestions(): QuestionsState {
  const { notifyError } = useNotify();

  const { data, isLoading, error } = useFetch(
    () => fetchAllQuestionnaireData(),
    [],
  );

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  return {
    questions: data?.questions ?? [],
    categories: data?.categories ?? [],
    optionsByQuestionId: data?.optionsByQuestionId ?? new Map(),
    isLoading,
    error,
  };
}
