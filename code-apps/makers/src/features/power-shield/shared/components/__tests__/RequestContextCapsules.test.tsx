// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextCapsules } from '../RequestContextCapsules';

const mocks = vi.hoisted(() => ({ getServiceTreeDetail: vi.fn() }));
vi.mock('../../services/dataverse/serviceTreeService', () => ({
  getServiceTreeDetail: mocks.getServiceTreeDetail,
}));
vi.mock('../../services/dataverse/environmentGroupService', () => ({
  getEnvironmentGroupDetail: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

let root: Root;
let container: HTMLDivElement;

async function render(serviceTreeId: string) {
  await act(async () => {
    root.render(
      <FluentProvider theme={webLightTheme}>
        <RequestContextCapsules serviceTreeId={serviceTreeId} serviceTreeName={`Name ${serviceTreeId}`} />
      </FluentProvider>,
    );
  });
}

async function clickCapsule() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Service Tree:"]');
  await act(async () => { button!.click(); });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('RequestContextCapsules', () => {
  it('ignores a slow reply for a previous request and loads the new one', async () => {
    const slowA = deferred<{ name: string }>();
    mocks.getServiceTreeDetail.mockImplementation((id: string) =>
      id === 'A' ? slowA.promise : Promise.resolve({ name: 'Tree B' }),
    );

    await render('A');
    await clickCapsule();
    await render('B');
    await act(async () => { slowA.resolve({ name: 'Tree A' }); });
    await clickCapsule();

    expect(document.body.textContent).toContain('Tree B');
    expect(document.body.textContent).not.toContain('Tree A');
  });

  it('reloads a request whose earlier load was abandoned', async () => {
    const slowA = deferred<{ name: string }>();
    mocks.getServiceTreeDetail
      .mockImplementationOnce(() => slowA.promise)
      .mockImplementation(() => Promise.resolve({ name: 'Tree A fresh' }));

    await render('A');
    await clickCapsule();
    await render('B');
    await render('A');
    await clickCapsule();

    expect(mocks.getServiceTreeDetail).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('Tree A fresh');
  });
});
