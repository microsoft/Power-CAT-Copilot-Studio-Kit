import { Cat_questionsService } from '../../../../../generated/services/Cat_questionsService';
import { Cat_questioncategoriesService } from '../../../../../generated/services/Cat_questioncategoriesService';
import { Cat_questionoptionsService } from '../../../../../generated/services/Cat_questionoptionsService';
import type { Cat_questions } from '../../../../../generated/models/Cat_questionsModel';
import { Cat_questionscat_answertype } from '../../../../../generated/models/Cat_questionsModel';
import type { Question, QuestionCategory, QuestionOption } from '../../../models/question';
import type { AnswerType } from '../../../models/status';

function toQuestion(r: Cat_questions): Question {
  const answerTypeKey = Number(r.cat_answertype) as keyof typeof Cat_questionscat_answertype;
  return {
    id: r.cat_questionid,
    questionText: r.cat_questionname,          // OOB primary name column
    answerType: (Cat_questionscat_answertype[answerTypeKey] as AnswerType) ?? 'Boolean',
    isRequired: !!(r.cat_isrequired as unknown),
    displayOrder: parseInt(r.cat_displayorder ?? '0', 10),
    isActive: !!(r.cat_isactive as unknown),
    categoryId: r._cat_questioncategoryid_value ?? '',
    parentQuestionId: r._cat_parentquestionid_value ?? null,
    parentTriggerValue: r.cat_parenttriggervalue ?? null,
    tooltipText: r.cat_tooltiptext ?? null,
  };
}

/**
 * Retrieves all active questionnaire questions in display order.
 * Question text is stored in cat_questionname (OOB primary name column).
 */
export async function getQuestions(): Promise<Question[]> {
  const result = await Cat_questionsService.getAll({
    filter: 'cat_isactive eq true',
    orderBy: ['cat_displayorder asc'],
    select: [
      'cat_questionid', 'cat_questionname', 'cat_answertype',
      'cat_isrequired', 'cat_displayorder', 'cat_isactive',
      '_cat_questioncategoryid_value', '_cat_parentquestionid_value',
      'cat_parenttriggervalue', 'cat_tooltiptext',
    ],
  });
  return (result.data ?? []).map((r) => toQuestion(r));
}

/**
 * Lightweight check: returns true if at least one active question exists.
 */
export async function hasActiveQuestions(): Promise<boolean> {
  const result = await Cat_questionsService.getAll({
    filter: 'cat_isactive eq true',
    select: ['cat_questionid'],
    top: 1,
  });
  return (result.data?.length ?? 0) > 0;
}

/**
 * Retrieves all active question categories in display order.
 * Category name is stored in cat_name (OOB primary name column).
 */
export async function getQuestionCategories(): Promise<QuestionCategory[]> {
  const result = await Cat_questioncategoriesService.getAll({
    filter: 'cat_isactive eq true',
    orderBy: ['cat_displayorder asc'],
    select: ['cat_questioncategoryid', 'cat_questioncategoryname', 'cat_displayorder'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_questioncategoryid,
    name: r.cat_questioncategoryname ?? '',    // OOB primary name column
    displayOrder: parseInt(r.cat_displayorder ?? '0', 10),
  }));
}

/**
 * Retrieves all active question options ordered by question then display order.
 * Option text is stored in cat_questionoptionname (OOB primary name column).
 */
export async function getQuestionOptions(): Promise<QuestionOption[]> {
  // No $select — Dataverse only returns _xxx_value lookup annotations when
  // no $select is specified; any $select suppresses them.
  const result = await Cat_questionoptionsService.getAll({
    filter: 'cat_isactive eq true',
    orderBy: ['cat_displayorder asc'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_questionoptionid,
    questionId: (r._cat_questionid_value ?? '').toLowerCase(),
    optionText: r.cat_questionoptionname ?? '', // OOB primary name column
    displayOrder: parseInt(r.cat_displayorder ?? '0', 10),
  }));
}
