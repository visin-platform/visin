import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainingInfoCard } from './TrainingInfoCard';
import type { Training } from '../types';

const training = {
  name: 'My Training',
  description: 'A description',
  status: 'completed',
  datasetId: 'd1',
  training_uuid: 'uuid-1',
  uuid: 'fallback-uuid',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
} as unknown as Training;

const getStatusColor = vi.fn().mockReturnValue('success' as const);
const formatDate = vi.fn((d: string) => `formatted:${d}`);

describe('TrainingInfoCard', () => {
  it('renders the name, description, status chip, and formatted dates', () => {
    render(<TrainingInfoCard training={training} getStatusColor={getStatusColor} formatDate={formatDate} />);

    expect(screen.getByText('My Training')).toBeInTheDocument();
    expect(screen.getByText('A description')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('d1')).toBeInTheDocument();
    expect(screen.getByText('uuid-1')).toBeInTheDocument();
    expect(screen.getAllByText('formatted:2026-01-01T00:00:00.000Z').length).toBeGreaterThan(0);
    expect(getStatusColor).toHaveBeenCalledWith('completed');
  });

  it('omits the description when absent', () => {
    render(
      <TrainingInfoCard
        training={{ ...training, description: undefined }}
        getStatusColor={getStatusColor}
        formatDate={formatDate}
      />
    );

    expect(screen.queryByText('A description')).not.toBeInTheDocument();
  });

  it('falls back to uuid when training_uuid is missing, and "-" when both and datasetId are missing', () => {
    render(
      <TrainingInfoCard
        training={{ ...training, training_uuid: undefined, datasetId: undefined }}
        getStatusColor={getStatusColor}
        formatDate={formatDate}
      />
    );

    expect(screen.getByText('fallback-uuid')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
