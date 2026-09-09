import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CostingEditor from './CostingEditor';
import type { ProjectCosting } from '../../types/taxonomy';

const renderEditor = (value: ProjectCosting = {}) => {
  const onChange = vi.fn();
  render(<CostingEditor value={value} onChange={onChange} />);
  return onChange;
};

describe('CostingEditor', () => {
  it('starts blank and says the project will show no costs', () => {
    renderEditor();

    expect(screen.getByLabelText('CPU rate per hour')).toHaveValue(null);
    expect(screen.getByText(/No rates set, so this project shows no costs/)).toBeInTheDocument();
  });

  it('asks for the second rate rather than billing half the machine', () => {
    renderEditor({ cpuRatePerHour: 0.006 });

    expect(screen.getByText(/Set both rates to show costs/)).toBeInTheDocument();
  });

  it('previews a worked example once both rates are set', () => {
    renderEditor({ cpuRatePerHour: 0.006, gpuRatePerHour: 0.2, currency: 'EUR' });

    // 10 hours at 0.206 — the figures this platform used to hard-code
    expect(screen.getByText(/A 10-hour training would cost/)).toBeInTheDocument();
    expect(screen.getByText('€2.06')).toBeInTheDocument();
  });

  it('reports a typed rate back to the caller', async () => {
    const onChange = renderEditor();

    await userEvent.type(screen.getByLabelText('GPU rate per hour'), '2');

    expect(onChange).toHaveBeenCalledWith({ gpuRatePerHour: 2 });
  });

  it('clears a rate when the field is emptied', async () => {
    const onChange = renderEditor({ gpuRatePerHour: 2 });

    await userEvent.clear(screen.getByLabelText('GPU rate per hour'));

    expect(onChange).toHaveBeenCalledWith({ gpuRatePerHour: undefined });
  });
});
