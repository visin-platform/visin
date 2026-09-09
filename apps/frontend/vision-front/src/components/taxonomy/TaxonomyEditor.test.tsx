import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaxonomyEditor from './TaxonomyEditor';
import type { ProjectTaxonomy } from '../../types/taxonomy';

const renderEditor = (value: ProjectTaxonomy = {}, props: Record<string, unknown> = {}) => {
  const onChange = vi.fn();
  render(<TaxonomyEditor value={value} onChange={onChange} {...props} />);
  return onChange;
};

describe('TaxonomyEditor', () => {
  it('says plainly that everything is optional', () => {
    renderEditor();
    expect(screen.getByText(/All optional/)).toBeInTheDocument();
    expect(screen.getAllByText(/taken from your data/).length).toBeGreaterThan(0);
  });

  it('renames the condition section as the axis label is set', () => {
    renderEditor({ conditionLabel: 'Site' });
    expect(screen.getByText('Sites')).toBeInTheDocument();
  });

  it('adds an empty condition row', async () => {
    const onChange = renderEditor();

    const [addCondition] = screen.getAllByRole('button', { name: 'Add' });
    await userEvent.click(addCondition);

    expect(onChange).toHaveBeenCalledWith({ conditions: [{ key: '' }] });
  });

  it('offers to import the vocabulary already present in the data', async () => {
    const onChange = renderEditor({}, { discovered: { conditions: ['line_a', 'line_b'] } });

    await userEvent.click(screen.getByText('Add 2 from data'));

    expect(onChange).toHaveBeenCalledWith({ conditions: [{ key: 'line_a' }, { key: 'line_b' }] });
  });

  it('does not re-offer a discovered value already configured', () => {
    renderEditor({ conditions: [{ key: 'line_a' }] }, { discovered: { conditions: ['line_a'] } });
    expect(screen.queryByText(/from data/)).not.toBeInTheDocument();
  });

  it('suggests the humanized key as the display-name placeholder', () => {
    renderEditor({ conditions: [{ key: 'day_fair' }] });
    expect(screen.getByPlaceholderText('Day Fair')).toBeInTheDocument();
  });

  it('removes a row', async () => {
    const onChange = renderEditor({ classes: [{ key: 'scratch' }, { key: 'dent' }] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove scratch' }));

    expect(onChange).toHaveBeenCalledWith({ classes: [{ key: 'dent' }] });
  });

  it('clears the field rather than storing an empty list', async () => {
    const onChange = renderEditor({ classes: [{ key: 'scratch' }] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove scratch' }));

    expect(onChange).toHaveBeenCalledWith({ classes: undefined });
  });

  it('hides the metric table in compact mode', () => {
    renderEditor({}, { compact: true });
    expect(screen.queryByText('Metrics')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task type')).toBeInTheDocument();
  });

  it('explains why metric direction has to be set by hand', () => {
    renderEditor();
    expect(screen.getByText(/Direction is the one thing your data cannot say/)).toBeInTheDocument();
  });

  it('records a metric direction', async () => {
    const onChange = renderEditor({ metrics: [{ key: 'rmse', direction: 'higher' }] });

    await userEvent.click(screen.getByLabelText('Direction'));
    await userEvent.click(screen.getByRole('option', { name: 'Lower is better' }));

    expect(onChange).toHaveBeenCalledWith({ metrics: [{ key: 'rmse', direction: 'lower' }] });
  });

  it('parses the comma-separated summary metric list', async () => {
    const onChange = renderEditor({ overallMetrics: [] });

    await userEvent.type(screen.getByLabelText('Summary metrics'), 'a');

    expect(onChange).toHaveBeenCalledWith({ overallMetrics: ['a'] });
  });
});
