import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import NumberFormattingControls from './NumberFormattingControls';

describe('NumberFormattingControls', () => {
  it('renders current decimals and multiplier values', () => {
    render(
      <NumberFormattingControls
        decimals={2}
        multiplier={1}
        onDecimalsChange={vi.fn()}
        onMultiplierChange={vi.fn()}
      />
    );
    expect(screen.getByText('Number Format')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onDecimalsChange with the new numeric value when selecting a decimals option', () => {
    const onDecimalsChange = vi.fn();
    render(
      <NumberFormattingControls
        decimals={0}
        multiplier={1}
        onDecimalsChange={onDecimalsChange}
        onMultiplierChange={vi.fn()}
      />
    );

    const [decimalsSelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(decimalsSelect);
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByText('3'));

    expect(onDecimalsChange).toHaveBeenCalledWith(3);
  });

  it('calls onMultiplierChange with the new numeric value when selecting a multiplier option', () => {
    const onMultiplierChange = vi.fn();
    render(
      <NumberFormattingControls
        decimals={0}
        multiplier={1}
        onDecimalsChange={vi.fn()}
        onMultiplierChange={onMultiplierChange}
      />
    );

    const [, multiplierSelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(multiplierSelect);
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByText('100'));

    expect(onMultiplierChange).toHaveBeenCalledWith(100);
  });
});
