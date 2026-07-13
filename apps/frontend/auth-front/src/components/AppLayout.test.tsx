import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppLayout from './AppLayout';

describe('AppLayout', () => {
  it('renders its children inside the layout container', () => {
    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    );

    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
