import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../generated/services/Cat_questioncategoriesService', () => ({ Cat_questioncategoriesService: {} }));
vi.mock('../../../generated/services/Cat_questionsService', () => ({ Cat_questionsService: {} }));
vi.mock('../../../generated/services/Cat_questionoptionsService', () => ({ Cat_questionoptionsService: {} }));

import type { Cat_questions } from '../../../generated/models/Cat_questionsModel';
import { mapQuestion } from '../features/admin/services/questionConfigService';

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

function row(extra: Record<string, unknown>): Cat_questions {
  return {
    cat_questionid: 'q-1',
    cat_questiontext: 'Is this a child question?',
    _cat_questioncategoryid_value: 'cat-1',
    ...extra,
  } as unknown as Cat_questions;
}

describe('mapQuestion lookup names', () => {
  it('reads the category and parent names from the OData formatted value', () => {
    const q = mapQuestion(row({
      [`_cat_questioncategoryid_value${FORMATTED}`]: 'Security',
      _cat_parentquestionid_value: 'q-0',
      [`_cat_parentquestionid_value${FORMATTED}`]: 'Parent question',
    }));

    expect(q.categoryId).toBe('cat-1');
    expect(q.categoryName).toBe('Security');
    expect(q.parentQuestionText).toBe('Parent question');
  });

  it('falls back to the legacy idname properties when no annotation is present', () => {
    const q = mapQuestion(row({
      cat_questioncategoryidname: 'Legacy category',
      cat_parentquestionidname: 'Legacy parent',
    }));

    expect(q.categoryName).toBe('Legacy category');
    expect(q.parentQuestionText).toBe('Legacy parent');
  });

  it('returns an empty category name and null parent when neither source is present', () => {
    const q = mapQuestion(row({}));

    expect(q.categoryName).toBe('');
    expect(q.parentQuestionText).toBeNull();
  });
});