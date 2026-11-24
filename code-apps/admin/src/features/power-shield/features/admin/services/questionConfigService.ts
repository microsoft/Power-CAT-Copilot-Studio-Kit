import { Cat_questioncategoriesService } from '../../../../../generated/services/Cat_questioncategoriesService';
import { Cat_questionsService } from '../../../../../generated/services/Cat_questionsService';
import { Cat_questionoptionsService } from '../../../../../generated/services/Cat_questionoptionsService';
import type { Cat_questioncategoriesBase } from '../../../../../generated/models/Cat_questioncategoriesModel';
import type { Cat_questions, Cat_questionsBase } from '../../../../../generated/models/Cat_questionsModel';
import type { Cat_questionoptionsBase } from '../../../../../generated/models/Cat_questionoptionsModel';
import type { QuestionCategoryConfig, QuestionConfig, QuestionOptionConfig } from '../../../models/questionConfig';
import type { AnswerType } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Answer Type Mapping
// ─────────────────────────────────────────────────────────────────────────────

const ANSWER_TYPE_MAP: Record<number, AnswerType> = {
  1: 'Boolean',
  2: 'Text',
  3: 'Choice',
  4: 'MultiselectChoice',
  5: 'Date',
};

const ANSWER_TYPE_REVERSE: Record<string, number> = {
  Boolean: 1,
  Text: 2,
  Choice: 3,
  MultiselectChoice: 4,
  Date: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Category CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuestionCategories(): Promise<QuestionCategoryConfig[]> {
  const result = await Cat_questioncategoriesService.getAll({
    filter: 'statecode eq 0',
    select: [
      'cat_questioncategoryid',
      'cat_questioncategoryname',
      'cat_displayorder',
      'cat_isactive',
    ],
    orderBy: ['cat_displayorder asc'],
    top: 500,
  });
  return (result.data ?? []).map(r => ({
    id: r.cat_questioncategoryid,
    name: r.cat_questioncategoryname ?? '',
    displayOrder: parseInt(r.cat_displayorder, 10) || 0,
    isActive: !!r.cat_isactive,
  }));
}

export async function createQuestionCategory(payload: {
  name: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<string> {
  const result = await Cat_questioncategoriesService.create({
    cat_questioncategoryname: payload.name,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
  } as unknown as Omit<Cat_questioncategoriesBase, 'cat_questioncategoryid'>);
  if (!result.success || !result.data?.cat_questioncategoryid) {
    throw new Error(result.error?.message ?? 'Failed to create question category.');
  }
  return result.data.cat_questioncategoryid;
}

export async function updateQuestionCategory(
  id: string,
  payload: { name: string; displayOrder: number; isActive: boolean },
): Promise<void> {
  const result = await Cat_questioncategoriesService.update(id, {
    cat_questioncategoryname: payload.name,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
  } as unknown as Partial<Cat_questioncategoriesBase>);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to update question category.');
  }
}

export async function deleteQuestionCategory(id: string): Promise<void> {
  await Cat_questioncategoriesService.delete(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Question CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuestions(): Promise<QuestionConfig[]> {
  const result = await Cat_questionsService.getAll({
    filter: 'statecode eq 0',
    select: [
      'cat_questionid', 'cat_questionname', 'cat_answertype',
      'cat_isrequired', 'cat_displayorder', 'cat_isactive',
      '_cat_questioncategoryid_value', '_cat_parentquestionid_value',
      'cat_parenttriggervalue', 'cat_tooltiptext',
    ],
    orderBy: ['cat_displayorder asc'],
    top: 500,
  });
  return (result.data ?? []).map(r => mapQuestion(r));
}

const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue';

/**
 * Maps a cat_question row to QuestionConfig. Lookup names come from the
 * formatted-value annotation; Dataverse doesn't populate the `...idname` properties.
 */
export function mapQuestion(r: Cat_questions): QuestionConfig {
  const row = r as unknown as Record<string, unknown>;
  const lookupName = (field: string) => (row[`${field}${FORMATTED_VALUE}`] as string | undefined) || undefined;
  return {
    id: r.cat_questionid,
    questionText: r.cat_questionname ?? '',
    answerType: ANSWER_TYPE_MAP[r.cat_answertype as number] ?? 'Text',
    isRequired: !!r.cat_isrequired,
    displayOrder: parseInt(r.cat_displayorder, 10) || 0,
    isActive: !!r.cat_isactive,
    categoryId: r._cat_questioncategoryid_value ?? '',
    categoryName: lookupName('_cat_questioncategoryid_value') ?? r.cat_questioncategoryidname ?? '',
    parentQuestionId: r._cat_parentquestionid_value ?? null,
    parentQuestionText: lookupName('_cat_parentquestionid_value') ?? r.cat_parentquestionidname ?? null,
    parentTriggerValue: r.cat_parenttriggervalue ?? null,
    tooltipText: r.cat_tooltiptext ?? null,
  };
}

export async function createQuestion(payload: {
  questionText: string;
  answerType: AnswerType;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
  categoryId: string;
  parentQuestionId?: string | null;
  parentTriggerValue?: string | null;
  tooltipText?: string | null;
}): Promise<string> {
  const record: Record<string, unknown> = {
    cat_questionname: payload.questionText,
    cat_answertype: ANSWER_TYPE_REVERSE[payload.answerType],
    cat_isrequired: payload.isRequired,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
    'cat_questioncategoryid@odata.bind': `/cat_questioncategories(${payload.categoryId})`,
  };
  if (payload.parentQuestionId) {
    record['cat_parentquestionid@odata.bind'] = `/cat_questions(${payload.parentQuestionId})`;
  }
  if (payload.parentTriggerValue) {
    record.cat_parenttriggervalue = payload.parentTriggerValue;
  }
  if (payload.tooltipText) {
    record.cat_tooltiptext = payload.tooltipText;
  }

  const result = await Cat_questionsService.create(
    record as Omit<Cat_questionsBase, 'cat_questionid'>,
  );
  if (!result.success || !result.data?.cat_questionid) {
    throw new Error(result.error?.message ?? 'Failed to create question.');
  }
  return result.data.cat_questionid;
}

export async function updateQuestion(
  id: string,
  payload: {
    questionText: string;
    answerType: AnswerType;
    isRequired: boolean;
    displayOrder: number;
    isActive: boolean;
    categoryId: string;
    parentQuestionId?: string | null;
    parentTriggerValue?: string | null;
    tooltipText?: string | null;
  },
): Promise<void> {
  const changedFields: Record<string, unknown> = {
    cat_questionname: payload.questionText,
    cat_answertype: ANSWER_TYPE_REVERSE[payload.answerType],
    cat_isrequired: payload.isRequired,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
    'cat_questioncategoryid@odata.bind': `/cat_questioncategories(${payload.categoryId})`,
  };
  if (payload.parentQuestionId) {
    changedFields['cat_parentquestionid@odata.bind'] = `/cat_questions(${payload.parentQuestionId})`;
  } else {
    changedFields['cat_parentquestionid@odata.bind'] = null;
  }
  changedFields.cat_parenttriggervalue = payload.parentTriggerValue ?? null;
  changedFields.cat_tooltiptext = payload.tooltipText ?? null;

  const result = await Cat_questionsService.update(
    id,
    changedFields as Partial<Cat_questionsBase>,
  );
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to update question.');
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  await Cat_questionsService.delete(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Question Option CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuestionOptions(): Promise<QuestionOptionConfig[]> {
  const result = await Cat_questionoptionsService.getAll({
    filter: 'statecode eq 0',
    select: [
      'cat_questionoptionid', '_cat_questionid_value',
      'cat_questionoptionname', 'cat_displayorder', 'cat_isactive',
    ],
    orderBy: ['_cat_questionid_value asc', 'cat_displayorder asc'],
    top: 2000,
  });
  return (result.data ?? []).map(r => ({
    id: r.cat_questionoptionid,
    questionId: r._cat_questionid_value ?? '',
    questionText: r.cat_questionidname ?? '',
    optionText: r.cat_questionoptionname ?? '',
    displayOrder: parseInt(r.cat_displayorder, 10) || 0,
    isActive: !!r.cat_isactive,
  }));
}

export async function getQuestionOptionsForQuestion(questionId: string): Promise<QuestionOptionConfig[]> {
  const result = await Cat_questionoptionsService.getAll({
    filter: `statecode eq 0 and _cat_questionid_value eq '${questionId}'`,
    select: [
      'cat_questionoptionid', '_cat_questionid_value',
      'cat_questionoptionname', 'cat_displayorder', 'cat_isactive',
    ],
    orderBy: ['cat_displayorder asc'],
    top: 100,
  });
  return (result.data ?? []).map(r => ({
    id: r.cat_questionoptionid,
    questionId: r._cat_questionid_value ?? '',
    optionText: r.cat_questionoptionname ?? '',
    displayOrder: parseInt(r.cat_displayorder, 10) || 0,
    isActive: !!r.cat_isactive,
  }));
}

export async function createQuestionOption(payload: {
  questionId: string;
  optionText: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<string> {
  const result = await Cat_questionoptionsService.create({
    'cat_questionid@odata.bind': `/cat_questions(${payload.questionId})`,
    cat_questionoptionname: payload.optionText,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
  } as unknown as Omit<Cat_questionoptionsBase, 'cat_questionoptionid'>);
  if (!result.success || !result.data?.cat_questionoptionid) {
    throw new Error(result.error?.message ?? 'Failed to create question option.');
  }
  return result.data.cat_questionoptionid;
}

export async function updateQuestionOption(
  id: string,
  payload: { optionText: string; displayOrder: number; isActive: boolean; questionId: string },
): Promise<void> {
  const result = await Cat_questionoptionsService.update(id, {
    cat_questionoptionname: payload.optionText,
    cat_displayorder: String(payload.displayOrder),
    cat_isactive: payload.isActive,
    'cat_questionid@odata.bind': `/cat_questions(${payload.questionId})`,
  } as unknown as Partial<Cat_questionoptionsBase>);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to update question option.');
  }
}

export async function deleteQuestionOption(id: string): Promise<void> {
  await Cat_questionoptionsService.delete(id);
}
