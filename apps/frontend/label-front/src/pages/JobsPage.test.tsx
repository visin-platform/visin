import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import JobsPage from './JobsPage';

describe('JobsPage', () => {
  it('renders the empty state', () => {
    render(<JobsPage />);

    expect(screen.getByText('No labeling jobs yet')).toBeInTheDocument();
    expect(screen.getByText('Jobs shared with your groups will appear here.')).toBeInTheDocument();
  });
});
