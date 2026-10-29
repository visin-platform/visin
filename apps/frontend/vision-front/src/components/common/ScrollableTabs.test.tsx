import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tab } from '@mui/material';
import ScrollableTabs from './ScrollableTabs';

describe('ScrollableTabs', () => {
  it('renders its tabs and reports the chosen one', () => {
    const onChange = vi.fn();
    render(
      <ScrollableTabs value="a" onChange={onChange} aria-label="sections">
        <Tab value="a" label="First" />
        <Tab value="b" label="Second" />
      </ScrollableTabs>
    );

    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'b');
  });
});
