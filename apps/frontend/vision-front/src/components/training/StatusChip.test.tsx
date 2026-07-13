import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusChip from './StatusChip';

describe('StatusChip', () => {
  it.each(['completed', 'running', 'failed', 'pending'] as const)('renders the %s status label', (status) => {
    render(<StatusChip status={status} />);

    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('falls back to the default (pending-style) styling for an unknown status', () => {
    render(<StatusChip status={'unknown' as never} />);

    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});
