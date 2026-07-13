import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './index';

vi.mock('../pages/TrainingsPage', () => ({ default: () => <div>TrainingsPage</div> }));
vi.mock('../pages/TrainingDetailPage', () => ({ default: () => <div>TrainingDetailPage</div> }));
vi.mock('../pages/TrainingComparisonPage', () => ({ default: () => <div>TrainingComparisonPage</div> }));
vi.mock('../pages/ComparisonDetailPage', () => ({ default: () => <div>ComparisonDetailPage</div> }));
vi.mock('../pages/EpochsPage', () => ({ default: () => <div>EpochsPage</div> }));
vi.mock('../pages/ConfigsPage', () => ({ default: () => <div>ConfigsPage</div> }));
vi.mock('../pages/DatasetsPage', () => ({ default: () => <div>DatasetsPage</div> }));
vi.mock('../pages/DatasetComparisonPage', () => ({ default: () => <div>DatasetComparisonPage</div> }));
vi.mock('../pages/DatasetDetailPage', () => ({ default: () => <div>DatasetDetailPage</div> }));
vi.mock('../pages/ImageLabelingPage', () => ({ default: () => <div>ImageLabelingPage</div> }));
vi.mock('../pages/TestResultsPage', () => ({ default: () => <div>TestResultsPage</div> }));
vi.mock('../pages/VisualizationsPage', () => ({ default: () => <div>VisualizationsPage</div> }));
vi.mock('../pages/VisualizationsComparisonPage', () => ({ default: () => <div>VisualizationsComparisonPage</div> }));
vi.mock('../pages/TrainingVisualizationsComparisonPage', () => ({ default: () => <div>TrainingVisualizationsComparisonPage</div> }));
vi.mock('../pages/BenchmarksPage', () => ({ default: () => <div>BenchmarksPage</div> }));
vi.mock('../pages/ProjectsPage', () => ({ default: () => <div>ProjectsPage</div> }));
vi.mock('../pages/ProjectDashboardPage', () => ({ default: () => <div>ProjectDashboardPage</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('AppRoutes', () => {
  it('redirects "/" to "/projects"', () => {
    renderAt('/');
    expect(screen.getByText('ProjectsPage')).toBeInTheDocument();
  });

  it.each([
    ['/projects', 'ProjectsPage'],
    ['/projects/p1', 'ProjectDashboardPage'],
    ['/comparisons/uuid-1', 'ComparisonDetailPage'],
    ['/trainings', 'TrainingsPage'],
    ['/trainings/t1', 'TrainingDetailPage'],
    ['/trainings/compare', 'TrainingComparisonPage'],
    ['/epochs', 'EpochsPage'],
    ['/configs', 'ConfigsPage'],
    ['/datasets', 'DatasetsPage'],
    ['/datasets/d1', 'DatasetDetailPage'],
    ['/datasets/compare', 'DatasetComparisonPage'],
    ['/image-labeling', 'ImageLabelingPage'],
    ['/image-labeling/img1', 'ImageLabelingPage'],
    ['/test-results', 'TestResultsPage'],
    ['/visualizations', 'VisualizationsPage'],
    ['/visualizations/compare', 'VisualizationsComparisonPage'],
    ['/visualizations/compare-trainings', 'TrainingVisualizationsComparisonPage'],
    ['/benchmarks', 'BenchmarksPage'],
  ])('renders %s at %s', (path, expectedText) => {
    renderAt(path);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
