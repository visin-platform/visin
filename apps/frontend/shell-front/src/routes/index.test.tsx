import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const Vision = () => <div>vision app</div>;
const Label = () => <div>label app</div>;
const Account = () => <div>account app</div>;
const Broken = () => {
  throw new Error('entry unreachable');
};

let labelBroken = false;

vi.mock('../remotes', () => ({
  remoteComponent: vi.fn((app: string) => {
    if (app === 'label') return labelBroken ? Broken : Label;
    return app === 'vision' ? Vision : Account;
  }),
  forgetRemote: vi.fn(() => {
    labelBroken = false;
  }),
}));
vi.mock('../components/LoginRedirect', () => ({ default: () => <div>login redirect</div> }));

import ShellRoutes from './index';
import { forgetRemote } from '../remotes';

const Path = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ShellRoutes />
      <Path />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  labelBroken = false;
});

describe('ShellRoutes', () => {
  it('lands on Vision projects from the root', () => {
    renderAt('/');

    expect(screen.getByText('vision app')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/projects');
  });

  it.each([
    ['/projects/p1', 'vision app'],
    ['/jobs/j1/work', 'label app'],
    ['/bundles', 'label app'],
    ['/account/groups', 'account app'],
    ['/invite', 'account app'],
  ])('renders the app that owns %s', (path, text) => {
    renderAt(path);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('serves the post-login return route itself', () => {
    renderAt('/login');

    expect(screen.getByText('login redirect')).toBeInTheDocument();
  });

  // vision-front forwarded this old address to label-front's domain; in the
  // shell Labeling is a route of the same page.
  it('keeps the old image-labeling address working without leaving the page', () => {
    renderAt('/image-labeling/img1');

    expect(screen.getByText('label app')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/jobs');
  });

  it('says so for a path no app owns', () => {
    renderAt('/nowhere');

    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('contains an app that fails to load, and retries it on request', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    labelBroken = true;
    renderAt('/jobs');

    expect(screen.getByText(/Labeling is unavailable right now\. entry unreachable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(forgetRemote).toHaveBeenCalledWith('label');
    expect(screen.getByText('label app')).toBeInTheDocument();
  });
});
