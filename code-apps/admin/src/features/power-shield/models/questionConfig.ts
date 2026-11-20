import type { AnswerType } from './status';

/** Extended QuestionCategory with all CRUD-relevant fields */
export interface QuestionCategoryConfig {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

/** Extended Question with all CRUD-relevant fields */
export interface QuestionConfig {
  id: string;
  questionText: string;
  answerType: AnswerType;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
  categoryId: string;
  categoryName?: string;
  parentQuestionId: string | null;
  parentQuestionText?: string | null;
  parentTriggerValue: string | null;
  tooltipText: string | null;
}

/** Extended QuestionOption with all CRUD-relevant fields */
export interface QuestionOptionConfig {
  id: string;
  questionId: string;
  questionText?: string;
  optionText: string;
  displayOrder: number;
  isActive: boolean;
}
