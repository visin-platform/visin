import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('../components/models/ModelRegistry', () => ({ default: ({ projectId }: { projectId?: string }) => <div>registry:{projectId ?? 'all'}</div> }));

import ModelsPage from './ModelsPage';
import { renderWithClient } from '../test/renderWithClient';

describe('ModelsPage', () => {
  it('shows the registry across every project the caller can see', () => {
    renderWithClient(<ModelsPage />);
    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument();
    expect(screen.getByText('registry:all')).toBeInTheDocument();
    expect(document.title).toContain('Models');
  });
});
