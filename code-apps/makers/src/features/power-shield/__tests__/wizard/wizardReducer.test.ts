import { describe, it, expect } from 'vitest';
import { wizardReducer } from '../../features/wizard/contexts/WizardContext';
import {
  WIZARD_INITIAL_STATE,
  type WizardAnswer,
  type WizardParticipant,
  type WizardSelectedConnector,
  type WizardSelectedEnvironment,
  type WizardState,
} from '../../features/wizard/contexts/wizardTypes';

// Helper — build a complete WizardState for LOAD_DRAFT tests
const makeDraftState = (): WizardState => ({
  draftRequestId: 'draft-001',
  highestCompletedStep: 3,
  serviceTreeId: 'st-001',
  serviceTreeName: 'My Service Tree',
  selectedEnvironments: [
    { environmentId: 'env-001', displayName: 'Production East' },
    { environmentId: 'env-002', displayName: 'Sandbox West' },
  ],
  cachedEnvironments: null,
  validatedEnvironmentIds: [],
  answers: [
    {
      questionId: 'q-001',
      questionText: 'Do you accept?',
      answerType: 'Boolean',
      isRequired: true,
      answerValue: 'true',
    },
  ],
  selectedConnectors: [{ connectorId: 'con-001', displayName: 'SharePoint', connectorKey: 'shared_sharepointonline' }],
  connectorActionOverrides: {},
  customConnectorPatterns: [],
  justification: 'This is a valid justification text.',
  supportingDocument: undefined,
  participants: [
    {
      dvUserId: 'user-001',
      aadObjectId: 'aad-001',
      upn: 'user@example.com',
      displayName: 'Test User',
      role: 'Participant',
    },
  ],
});

describe('wizardReducer', () => {
  describe('SET_SERVICE_TREE', () => {
    it('sets serviceTreeId and serviceTreeName', () => {
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_SERVICE_TREE',
        payload: { id: 'st-001', name: 'Payments' },
      });
      expect(next.serviceTreeId).toBe('st-001');
      expect(next.serviceTreeName).toBe('Payments');
    });

    it('does not modify other fields', () => {
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_SERVICE_TREE',
        payload: { id: 'st-001', name: 'Payments' },
      });
      expect(next.selectedEnvironments).toEqual([]);
      expect(next.justification).toBe('');
    });
  });

  describe('SET_ENVIRONMENTS', () => {
    it('sets selectedEnvironments', () => {
      const envs: WizardSelectedEnvironment[] = [
        { environmentId: 'env-001', displayName: 'Production East' },
        { environmentId: 'env-002', displayName: 'Sandbox West' },
      ];
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_ENVIRONMENTS',
        payload: envs,
      });
      expect(next.selectedEnvironments).toEqual(envs);
    });

    it('replaces existing environment selection', () => {
      const state = {
        ...WIZARD_INITIAL_STATE,
        selectedEnvironments: [{ environmentId: 'env-old', displayName: 'Old Env' }],
      };
      const newEnvs: WizardSelectedEnvironment[] = [
        { environmentId: 'env-new', displayName: 'New Env' },
      ];
      const next = wizardReducer(state, {
        type: 'SET_ENVIRONMENTS',
        payload: newEnvs,
      });
      expect(next.selectedEnvironments).toEqual(newEnvs);
    });
  });

  describe('SET_ANSWER', () => {
    it('adds a new answer when questionId does not exist', () => {
      const answer: WizardAnswer = {
        questionId: 'q-001',
        questionText: 'Is this compliant?',
        answerType: 'Boolean',
        isRequired: true,
        answerValue: 'true',
      };
      const next = wizardReducer(WIZARD_INITIAL_STATE, { type: 'SET_ANSWER', payload: answer });
      expect(next.answers).toHaveLength(1);
      expect(next.answers[0].answerValue).toBe('true');
    });

    it('updates an existing answer for the same questionId', () => {
      const existing: WizardAnswer = {
        questionId: 'q-001',
        questionText: 'Is this compliant?',
        answerType: 'Boolean',
        isRequired: true,
        answerValue: 'false',
      };
      const state = { ...WIZARD_INITIAL_STATE, answers: [existing] };
      const updated: WizardAnswer = { ...existing, answerValue: 'true' };
      const next = wizardReducer(state, { type: 'SET_ANSWER', payload: updated });
      expect(next.answers).toHaveLength(1);
      expect(next.answers[0].answerValue).toBe('true');
    });
  });

  describe('SET_CONNECTORS', () => {
    it('sets selectedConnectors', () => {
      const payload: WizardSelectedConnector[] = [
        { connectorId: 'con-001', displayName: 'SharePoint', connectorKey: 'shared_sharepointonline' },
        { connectorId: 'con-002', displayName: 'Outlook', connectorKey: 'shared_office365' },
      ];
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_CONNECTORS',
        payload,
      });
      expect(next.selectedConnectors).toEqual(payload);
    });
  });

  describe('SET_JUSTIFICATION', () => {
    it('sets justification text', () => {
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_JUSTIFICATION',
        payload: 'We need this connector for business process X.',
      });
      expect(next.justification).toBe('We need this connector for business process X.');
    });
  });

  describe('SET_DOCUMENT', () => {
    it('sets supportingDocument to a File', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_DOCUMENT',
        payload: file,
      });
      expect(next.supportingDocument).toBe(file);
    });

    it('sets supportingDocument to undefined when cleared', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const state = { ...WIZARD_INITIAL_STATE, supportingDocument: file };
      const next = wizardReducer(state, { type: 'SET_DOCUMENT', payload: undefined });
      expect(next.supportingDocument).toBeUndefined();
    });
  });

  describe('SET_PARTICIPANTS', () => {
    it('sets participants list', () => {
      const participant: WizardParticipant = {
        dvUserId: 'user-001',
        aadObjectId: 'aad-001',
        upn: 'user@example.com',
        displayName: 'Test User',
        role: 'Participant',
      };
      const next = wizardReducer(WIZARD_INITIAL_STATE, {
        type: 'SET_PARTICIPANTS',
        payload: [participant],
      });
      expect(next.participants).toHaveLength(1);
      expect(next.participants[0].role).toBe('Participant');
    });

    it('replaces entire participants list', () => {
      const existing: WizardParticipant = {
        dvUserId: 'user-old',
        aadObjectId: 'aad-old',
        upn: 'old@example.com',
        displayName: 'Old User',
        role: 'Participant',
      };
      const state = { ...WIZARD_INITIAL_STATE, participants: [existing] };
      const next = wizardReducer(state, { type: 'SET_PARTICIPANTS', payload: [] });
      expect(next.participants).toHaveLength(0);
    });
  });

  describe('LOAD_DRAFT', () => {
    it('replaces entire state with the draft payload', () => {
      const draft = makeDraftState();
      const next = wizardReducer(WIZARD_INITIAL_STATE, { type: 'LOAD_DRAFT', payload: draft });
      expect(next.draftRequestId).toBe('draft-001');
      expect(next.serviceTreeId).toBe('st-001');
      expect(next.highestCompletedStep).toBe(3);
      expect(next.selectedEnvironments).toEqual([
        { environmentId: 'env-001', displayName: 'Production East' },
        { environmentId: 'env-002', displayName: 'Sandbox West' },
      ]);
      expect(next.answers).toHaveLength(1);
      expect(next.selectedConnectors).toEqual([{ connectorId: 'con-001', displayName: 'SharePoint' }]);
      expect(next.participants).toHaveLength(1);
    });
  });

  describe('RESET', () => {
    it('returns state equal to WIZARD_INITIAL_STATE', () => {
      const dirty = makeDraftState();
      const next = wizardReducer(dirty, { type: 'RESET' });
      expect(next).toEqual(WIZARD_INITIAL_STATE);
    });

    it('clears all fields including draftRequestId', () => {
      const dirty = makeDraftState();
      const next = wizardReducer(dirty, { type: 'RESET' });
      expect(next.draftRequestId).toBeUndefined();
      expect(next.highestCompletedStep).toBe(0);
      expect(next.selectedEnvironments).toEqual([]);
      expect(next.answers).toEqual([]);
      expect(next.participants).toEqual([]);
    });
  });
});
