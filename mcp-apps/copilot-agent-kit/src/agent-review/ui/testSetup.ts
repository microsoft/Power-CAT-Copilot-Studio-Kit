import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('tabster', () => import('tabster/dist/esm/index.js'));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollTo = vi.fn();
