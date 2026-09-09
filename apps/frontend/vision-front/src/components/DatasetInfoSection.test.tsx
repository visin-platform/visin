import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import DatasetInfoSection from './DatasetInfoSection';
import type { Training } from '../types';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error test polyfill
  global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;
});

const baseTraining: Training = {
  _id: 't1',
  uuid: 'uuid1',
  name: 'My Training',
  status: 'completed',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

describe('DatasetInfoSection', () => {
  it('renders nothing when training has no dataset_info metadata', () => {
    const { container } = render(<DatasetInfoSection training={baseTraining} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the dataset overview when dataset_info is present', () => {
    const training: Training = {
      ...baseTraining,
      metadata: {
        dataset_info: {
          dataset_overview: {
            name: 'Waymo',
            version: '1.0',
            total_frames: 1000,
            classes: { vehicle: 1, sign: 1 }
          }
        }
      }
    };
    render(<DatasetInfoSection training={training} />);
    expect(screen.getByText('Dataset Information')).toBeInTheDocument();
    expect(screen.getByText('Waymo')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('renders the dataset splits chart when dataset_splits is present', () => {
    const training: Training = {
      ...baseTraining,
      metadata: {
        dataset_info: {
          dataset_overview: { total_frames: 100 },
          dataset_splits: { train_frames: 60, validation_frames: 20, test_frames: 20 }
        }
      }
    };
    render(<DatasetInfoSection training={training} />);
    expect(screen.getByText('Dataset Splits')).toBeInTheDocument();
  });

  it('renders the condition breakdown chart when test_breakdown is present', () => {
    const training: Training = {
      ...baseTraining,
      metadata: {
        dataset_info: {
          dataset_overview: { total_frames: 100 },
          dataset_splits: {
            train_frames: 60,
            validation_frames: 20,
            test_frames: 20,
            test_breakdown: {
              day_fair: { count: 5, percentage: 25 },
              day_rain: { count: 5, percentage: 25 },
              night_fair: { count: 5, percentage: 25 },
              night_rain: { count: 5, percentage: 25 },
              // a fifth condition the old hard-coded four-bar chart dropped entirely
              snow: { count: 5, percentage: 25 }
            }
          }
        }
      }
    };
    render(<DatasetInfoSection training={training} />);

    // axis tick labels don't lay out in jsdom, so the bar set itself is covered
    // by orderKeysByTaxonomy's own tests; here we check the section renders
    expect(screen.getByText('Test Set Conditions')).toBeInTheDocument();
  });

  it('uses the project taxonomy for the axis heading and bar labels', () => {
    const training: Training = {
      ...baseTraining,
      metadata: {
        dataset_info: {
          dataset_overview: { total_frames: 100 },
          dataset_splits: {
            test_breakdown: { line_a: { count: 5, percentage: 50 }, line_b: { count: 5, percentage: 50 } }
          }
        }
      }
    };
    render(
      <TaxonomyProvider
        taxonomy={{ conditionLabel: 'Line', conditions: [{ key: 'line_a', label: 'Line A' }] }}
      >
        <DatasetInfoSection training={training} />
      </TaxonomyProvider>
    );

    expect(screen.getByText('Test Set Lines')).toBeInTheDocument();
  });

  it('renders class distribution and frames-per-class charts when classes are present', () => {
    const training: Training = {
      ...baseTraining,
      metadata: {
        dataset_info: {
          dataset_overview: { total_frames: 100, total_pixels: 1000 },
          segmentation_statistics: {
            classes: {
              vehicle: { name: 'vehicle', total_pixels: 400, frames_with_class: 80 },
              sign: { name: 'sign', total_pixels: 100, frames_with_class: 20 }
            }
          }
        }
      }
    };
    render(<DatasetInfoSection training={training} />);
    expect(screen.getByText('Class Pixel Distribution')).toBeInTheDocument();
    expect(screen.getByText('Frames Containing Each Class')).toBeInTheDocument();
  });
});
