import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SampleTour from './SampleTour';

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

const renderTour = ({ anchors = ['loss-chart', 'miou-chart', 'training-actions'], search = '?guide=sample&tab=overview' } = {}) => {
  const onDeleteSample = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/trainings/t1${search}`]}>
      {anchors.map((anchor) => (
        <div key={anchor} data-guide={anchor}>
          {anchor}
        </div>
      ))}
      <SampleTour onDeleteSample={onDeleteSample} />
      <Location />
    </MemoryRouter>
  );
  return { onDeleteSample };
};

describe('SampleTour', () => {
  it('walks the three callouts and ends by offering to delete the sample', async () => {
    const { onDeleteSample } = renderTour();

    expect(await screen.findByRole('dialog', { name: 'Every epoch lands here' })).toHaveTextContent('1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'Nothing to declare' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'That was a sample' })).toHaveTextContent('3 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Delete this sample' }));
    expect(onDeleteSample).toHaveBeenCalled();
    // The tour lives in the URL; ending it leaves the rest of the address alone.
    expect(screen.getByTestId('location')).toHaveTextContent('?tab=overview');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('skips a callout whose element is not on the page', async () => {
    renderTour({ anchors: ['loss-chart', 'training-actions'] });

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'That was a sample' }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('can be ended at any step', async () => {
    renderTour();
    fireEvent.click(await screen.findByRole('button', { name: 'End tour' }));
    expect(screen.getByTestId('location')).toHaveTextContent('?tab=overview');
  });

  it('ends by itself with nothing on the page to point at', async () => {
    renderTour({ anchors: [], search: '?guide=sample' });
    // Each missing element is looked for for two seconds before it is skipped.
    await waitFor(() => expect(screen.getByTestId('location')).toBeEmptyDOMElement(), { timeout: 8000 });
  }, 10_000);

  it('does nothing without ?guide=sample', () => {
    renderTour({ search: '' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
