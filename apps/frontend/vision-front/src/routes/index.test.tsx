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
vi.mock('../pages/DatasetDetailPage', () => ({ default: () => <div>DatasetDetailPage</div> }));
vi.mock('../pages/LabelingRedirectPage', () => ({ default: () => <div>LabelingRedirectPage</div> }));
vi.mock('../pages/TestResultsPage', () => ({ default: () => <div>TestResultsPage</div> }));
vi.mock('../pages/VisualizationsPage', () => ({ default: () => <div>VisualizationsPage</div> }));
vi.mock('../pages/VisualizationsComparisonPage', () => ({ default: () => <div>VisualizationsComparisonPage</div> }));
vi.mock('../pages/TrainingVisualizationsComparisonPage', () => ({ default: () => <div>TrainingVisualizationsComparisonPage</div> }));
vi.mock('../pages/BenchmarksPage', () => ({ default: () => <div>BenchmarksPage</div> }));
vi.mock('../pages/ModelsPage', () => ({ default: () => <div>ModelsPage</div> }));
vi.mock('../pages/EvaluationsPage', () => ({ default: () => <div>EvaluationsPage</div> }));
vi.mock('../pages/EvaluationDetailPage', () => ({ default: () => <div>EvaluationDetailPage</div> }));
vi.mock('../pages/SuitesPage', () => ({ default: () => <div>SuitesPage</div> }));
vi.mock('../pages/SuitePage', () => ({ default: () => <div>SuitePage</div> }));
vi.mock('../pages/PublicLeaderboardsPage', () => ({ default: () => <div>PublicLeaderboardsPage</div> }));
vi.mock('../pages/PublicLeaderboardPage', () => ({ default: () => <div>PublicLeaderboardPage</div> }));
vi.mock('../pages/PublicEvaluationPage', () => ({ default: () => <div>PublicEvaluationPage</div> }));
vi.mock('../pages/PapersPage', () => ({ default: () => <div>PapersPage</div> }));
vi.mock('../pages/PaperDetailPage', () => ({ default: () => <div>PaperDetailPage</div> }));
vi.mock('../pages/PaperEditPage', () => ({ default: () => <div>PaperEditPage</div> }));
vi.mock('../pages/ProjectsPage', () => ({ default: () => <div>ProjectsPage</div> }));
vi.mock('../pages/ProjectDashboardPage', () => ({ default: () => <div>ProjectDashboardPage</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('AppRoutes', () => {
  it('redirects "/" to "/projects"', async () => {
    renderAt('/');
    expect(await screen.findByText('ProjectsPage')).toBeInTheDocument();
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
    ['/image-labeling', 'LabelingRedirectPage'],
    ['/image-labeling/img1', 'LabelingRedirectPage'],
    ['/test-results', 'TestResultsPage'],
    ['/visualizations', 'VisualizationsPage'],
    ['/visualizations/compare', 'VisualizationsComparisonPage'],
    ['/visualizations/compare-trainings', 'TrainingVisualizationsComparisonPage'],
    ['/benchmarks', 'BenchmarksPage'],
    ['/models', 'ModelsPage'],
    ['/evaluations', 'EvaluationsPage'],
    ['/evaluations/e1', 'EvaluationDetailPage'],
    ['/suites', 'SuitesPage'],
    ['/suites/road-test/1', 'SuitePage'],
    ['/leaderboards', 'PublicLeaderboardsPage'],
    ['/leaderboards/road-test/1', 'PublicLeaderboardPage'],
    ['/leaderboards/road-test/1/e1', 'PublicEvaluationPage'],
    ['/papers', 'PapersPage'],
    ['/papers/new', 'PaperEditPage'],
    ['/papers/pa1', 'PaperDetailPage'],
    ['/papers/pa1/edit', 'PaperEditPage'],
  ])('renders %s at %s', async (path, expectedText) => {
    renderAt(path);
    expect(await screen.findByText(expectedText)).toBeInTheDocument();
  });
});
