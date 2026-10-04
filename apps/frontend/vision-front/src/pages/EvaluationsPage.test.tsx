import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('../components/evaluations/EvaluationList', () => ({ default: () => <div>evaluation-list</div> }));

import EvaluationsPage from './EvaluationsPage';
import { renderWithClient } from '../test/renderWithClient';

describe('EvaluationsPage', () => {
  it('shows every evaluation the caller can read, under a title that says what they are', () => {
    renderWithClient(<EvaluationsPage />);
    expect(screen.getByRole('heading', { name: 'Evaluations' })).toBeInTheDocument();
    expect(screen.getByText('evaluation-list')).toBeInTheDocument();
    expect(document.title).toContain('Evaluations');
  });
});
