import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
const config = vi.hoisted(() => ({ SHELL_FRONT_URL: undefined as string | undefined }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../config/ConfigProvider', () => ({ useConfig: () => config }));

import AskAboutPaper from './AskAboutPaper';

beforeEach(() => {
  auth.isAuthenticated = true;
  config.SHELL_FRONT_URL = undefined;
});
afterEach(() => document.getElementById('shell-root')?.remove());

describe('AskAboutPaper', () => {
  it('opens chat on the paper, through the shell, when the page is inside it', async () => {
    document.body.append(Object.assign(document.createElement('div'), { id: 'shell-root' }));
    const seen: unknown[] = [];
    window.addEventListener('visin:open-chat', (event) => seen.push((event as CustomEvent).detail), { once: true });
    render(<AskAboutPaper paperId="pa1" title="Night segmentation" />);

    await userEvent.click(screen.getByRole('button', { name: 'Ask about this paper' }));

    expect(seen).toEqual([{ kind: 'assistant', paperId: 'pa1', title: 'Night segmentation' }]);
  });

  it('is for someone signed in, since chat is', () => {
    auth.isAuthenticated = false;
    const { container } = render(<AskAboutPaper paperId="pa1" title="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
