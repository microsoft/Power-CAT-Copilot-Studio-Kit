import { useMemo } from 'react';
import type { PromptRow } from '../contracts/types';
import { getPromptLabel } from '../utils/format';
import { usePromptsList } from './usePromptsList';

const NO_PROMPTS: PromptRow[] = [];

/** Prompts plus an ID → display label map (keys stored raw and lower-cased). */
export function usePromptLabelMap() {
  const query = usePromptsList();
  const prompts = query.data ?? NO_PROMPTS;
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const prompt of prompts) {
      const label = getPromptLabel(prompt);
      map.set(prompt.id, label);
      map.set(prompt.id.toLowerCase(), label);
    }
    return map;
  }, [prompts]);
  return { query, prompts, labels };
}
