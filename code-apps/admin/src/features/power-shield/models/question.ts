import type { AnswerType } from './status';

export interface Question {
  id: string;             // cat_questionid (PK GUID)
  questionText: string;   // cat_questionname (OOB primary name column)
  answerType: AnswerType; // cat_answertype
  isRequired: boolean;    // cat_isrequired
  displayOrder: number;   // cat_displayorder
  isActive: boolean;      // cat_isactive
  categoryId: string;             // _cat_questioncategoryid_value
  parentQuestionId: string | null; // _cat_parentquestionid_value (null = always visible)
  parentTriggerValue: string | null; // cat_parenttriggervalue
  tooltipText: string | null;      // cat_tooltiptext
}

export interface QuestionCategory {
  id: string;           // cat_questioncategoryid
  name: string;         // cat_questioncategoryname (OOB primary name column)
  displayOrder: number; // cat_displayorder
}

export interface QuestionOption {
  id: string;           // cat_questionoptionid
  questionId: string;   // _cat_questionid_value
  optionText: string;   // cat_questionoptionname (OOB primary name column)
  displayOrder: number; // cat_displayorder
}
