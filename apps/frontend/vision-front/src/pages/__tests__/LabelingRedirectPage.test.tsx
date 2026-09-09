import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../config/ConfigProvider', () => ({
  getGlobalConfig: vi.fn(() => ({ LABEL_FRONT_URL: 'https://label.test' })),
}));

import LabelingRedirectPage from '../LabelingRedirectPage';
import { getGlobalConfig } from '../../config/ConfigProvider';

const replace = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGlobalConfig).mockReturnValue({ LABEL_FRONT_URL: 'https://label.test' });
  Object.defineProperty(window, 'location', {
    value: { replace },
    writable: true,
  });
});

describe('LabelingRedirectPage', () => {
  it('forwards straight to label-front instead of showing an interstitial', () => {
    render(<LabelingRedirectPage />);

    expect(replace).toHaveBeenCalledWith('https://label.test/jobs');
    expect(screen.queryByText('Labeling has moved')).not.toBeInTheDocument();
  });

  it('offers a manual link in case the redirect is blocked', () => {
    render(<LabelingRedirectPage />);

    expect(screen.getByRole('link', { name: /Continue to Labeling/ })).toHaveAttribute(
      'href',
      'https://label.test/jobs'
    );
  });

  it('trims a trailing slash off the configured URL', () => {
    vi.mocked(getGlobalConfig).mockReturnValue({ LABEL_FRONT_URL: 'https://label.test/' });
    render(<LabelingRedirectPage />);

    expect(replace).toHaveBeenCalledWith('https://label.test/jobs');
  });

  it('redirects nowhere when labeling is not configured', () => {
    // it used to fall back to our own hosted label-front, which sent the users
    // of any other deployment off to a domain they have nothing to do with
    vi.mocked(getGlobalConfig).mockReturnValue({});
    render(<LabelingRedirectPage />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(/Labeling is not configured/)).toBeInTheDocument();
  });
});
