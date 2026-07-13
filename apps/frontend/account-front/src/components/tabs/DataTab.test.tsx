import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataTab from './DataTab';

describe('DataTab', () => {
  it('renders the data & privacy sections', () => {
    render(<DataTab />);

    expect(screen.getByText('Data & Privacy')).toBeInTheDocument();
    expect(screen.getByText('Download your data')).toBeInTheDocument();
    expect(screen.getByText('Privacy Preferences')).toBeInTheDocument();
    expect(screen.getByText('Delete Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    expect(screen.getByText('Personalized experience')).toBeInTheDocument();
    expect(screen.getByText('Usage analytics')).toBeInTheDocument();
  });
});
