import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../config/ConfigProvider', () => ({
  getGlobalConfig: vi.fn(() => ({ LABEL_FRONT_URL: 'https://label.test' })),
}));

import LabelingRedirectPage from '../LabelingRedirectPage';
import { getGlobalConfig } from '../../config/ConfigProvider';

describe('LabelingRedirectPage', () => {
  it('links to the configured label-front', () => {
    render(<LabelingRedirectPage />);

    expect(screen.getByText('Labeling has moved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Labeling/ })).toHaveAttribute('href', 'https://label.test');
  });

  it('falls back to the production URL without config', () => {
    vi.mocked(getGlobalConfig).mockReturnValue({});
    render(<LabelingRedirectPage />);

    expect(screen.getByRole('link', { name: /Open Labeling/ })).toHaveAttribute('href', 'https://label.visin.eu');
  });
});
