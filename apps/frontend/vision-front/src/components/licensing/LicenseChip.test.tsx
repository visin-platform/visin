import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LicenseChip from './LicenseChip';

describe('LicenseChip', () => {
  it('says the licence is not stated, which is not the same as free to use', () => {
    render(<LicenseChip license={undefined} of="dataset" />);
    expect(screen.getByText('Licence not stated')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links a licence that has a text', () => {
    render(<LicenseChip license={{ id: 'mit', name: 'MIT', url: 'https://opensource.org/license/mit', commercial: true }} />);
    expect(screen.getByRole('link', { name: 'MIT' })).toHaveAttribute('href', 'https://opensource.org/license/mit');
  });

  it('marks a licence that forbids commercial use, in words and not only in colour', () => {
    render(<LicenseChip license={{ id: 'cc-by-nc-4.0', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/', commercial: false }} />);
    expect(screen.getByRole('link', { name: 'CC BY-NC 4.0 · non-commercial' })).toBeInTheDocument();
  });

  it('shows a licence of the other kind by the name it was given, as plain text without a link', () => {
    render(<LicenseChip license={{ id: 'other', name: 'Acme research terms' }} />);
    expect(screen.getByText('Acme research terms')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
