import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricName from './MetricName';

describe('MetricName', () => {
  it('explains the metric on hover and keeps its own name as the label', async () => {
    render(<MetricName label="mIoU" description="Mean IoU, averaged over the classes." />);
    const name = screen.getByText('mIoU');
    expect(name).toHaveAttribute('tabindex', '0');
    await userEvent.hover(name);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Mean IoU, averaged over the classes.');
    expect(name).not.toHaveAttribute('aria-label');
  });

  it('is plain text when nobody defined the metric', () => {
    render(<MetricName label="Weld quality" />);
    expect(screen.getByText('Weld quality')).not.toHaveAttribute('tabindex');
  });
});
