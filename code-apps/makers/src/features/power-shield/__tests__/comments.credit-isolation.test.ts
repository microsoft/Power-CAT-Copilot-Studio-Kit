import { describe, it, expect, vi, beforeEach } from 'vitest';

// Comments on the Credit detail page: the thread is gated on the parent request
// type, and attachment downloads are locked to the request being viewed.

const h = vi.hoisted(() => {
  const svc = () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
  return {
    requests: svc(),
    environments: svc(),
    connectors: svc(),
    answers: svc(),
    participants: svc(),
    patterns: svc(),
    annotations: svc(),
    comments: svc(),
  };
});

vi.mock('../../../generated/services/Cat_policyrequestsService', () => ({ Cat_policyrequestsService: h.requests }));
vi.mock('../../../generated/services/Cat_policyrequestenvironmentsService', () => ({ Cat_policyrequestenvironmentsService: h.environments }));
vi.mock('../../../generated/services/Cat_policyrequestconnectorsService', () => ({ Cat_policyrequestconnectorsService: h.connectors }));
vi.mock('../../../generated/services/Cat_policyrequestanswersService', () => ({ Cat_policyrequestanswersService: h.answers }));
vi.mock('../../../generated/services/Cat_policyrequestparticipantsService', () => ({ Cat_policyrequestparticipantsService: h.participants }));
vi.mock('../../../generated/services/Cat_powershieldcustomconnectorpatternsService', () => ({ Cat_powershieldcustomconnectorpatternsService: h.patterns }));
vi.mock('../../../generated/services/AnnotationsService', () => ({ AnnotationsService: h.annotations }));
vi.mock('../../../generated/services/Cat_powershieldpolicyrequestcommentsService', () => ({ Cat_powershieldpolicyrequestcommentsService: h.comments }));

import {
  getCommentsForRequest,
  createCommentWithAttachments,
  downloadAttachment,
} from '../shared/services/dataverse/commentService';

const CONNECTOR = 335350000;
const CREDITS = 335350001;

function ok<T>(data: T) {
  return { success: true, data };
}

const commentParams = {
  requestId: 'req-1',
  body: 'hello',
  dvUserId: 'u1',
  aadObjectId: 'a1',
  displayName: 'Maker',
  upn: 'maker@contoso.com',
  isAdmin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.comments.getAll.mockResolvedValue(ok([]));
  h.comments.create.mockResolvedValue(ok({ cat_powershieldpolicyrequestcommentid: 'c-new' }));
});

describe('credit comments — loading', () => {
  it('loads the thread of a credit request when asked for Credits', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CREDITS }));
    await expect(getCommentsForRequest('req-1', 'Credits')).resolves.toEqual([]);
    expect(h.comments.getAll).toHaveBeenCalled();
  });

  it('rejects a connector request when asked for Credits', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CONNECTOR }));
    await expect(getCommentsForRequest('req-1', 'Credits')).rejects.toThrow();
    expect(h.comments.getAll).not.toHaveBeenCalled();
  });

  it('still rejects a credit request by default (Connector)', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CREDITS }));
    await expect(getCommentsForRequest('req-1')).rejects.toThrow();
    expect(h.comments.getAll).not.toHaveBeenCalled();
  });
});

describe('credit comments — posting', () => {
  it('posts to a credit request when asked for Credits', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CREDITS }));
    await createCommentWithAttachments(commentParams, [], 'Credits');
    expect(h.comments.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a type mismatch before creating the comment', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CONNECTOR }));
    await expect(createCommentWithAttachments(commentParams, [], 'Credits')).rejects.toThrow();
    expect(h.comments.create).not.toHaveBeenCalled();
  });
});

describe('credit comments — download', () => {
  beforeEach(() => {
    h.annotations.get.mockResolvedValueOnce(ok({ notetext: 'c-1' }));
    h.comments.get.mockResolvedValue(ok({ _cat_policyrequest_value: 'REQ-1' }));
  });

  it('downloads an attachment that belongs to the viewed credit request', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CREDITS }));
    h.annotations.get.mockResolvedValueOnce(ok({ filename: 'a.txt', mimetype: 'text/plain', documentbody: 'QQ==' }));
    await expect(downloadAttachment('ann-1', 'Credits', 'req-1')).resolves.toMatchObject({ fileName: 'a.txt' });
  });

  it('rejects an attachment from another request before reading its body', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CREDITS }));
    await expect(downloadAttachment('ann-1', 'Credits', 'req-other')).rejects.toThrow(/does not belong/);
    expect(h.annotations.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a type mismatch before reading the body', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: CONNECTOR }));
    await expect(downloadAttachment('ann-1', 'Credits', 'req-1')).rejects.toThrow();
    expect(h.annotations.get).toHaveBeenCalledTimes(1);
  });
});
