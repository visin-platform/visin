import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader } from '@visin/frontend-core';

// Each page is its own chunk: the charts (@mui/x-charts and d3) weigh more than
// the rest of the app together and most pages never draw one, and as a shell
// remote a smaller entry reaches first paint sooner.
const TrainingsPage = lazy(() => import('../pages/TrainingsPage'));
const TrainingDetailPage = lazy(() => import('../pages/TrainingDetailPage'));
const TrainingComparisonPage = lazy(() => import('../pages/TrainingComparisonPage'));
const ComparisonDetailPage = lazy(() => import('../pages/ComparisonDetailPage'));
const EpochsPage = lazy(() => import('../pages/EpochsPage'));
const ConfigsPage = lazy(() => import('../pages/ConfigsPage'));
const DatasetsPage = lazy(() => import('../pages/DatasetsPage'));
const DatasetDetailPage = lazy(() => import('../pages/DatasetDetailPage'));
const LabelingRedirectPage = lazy(() => import('../pages/LabelingRedirectPage'));
const TestResultsPage = lazy(() => import('../pages/TestResultsPage'));
const VisualizationsPage = lazy(() => import('../pages/VisualizationsPage'));
const VisualizationsComparisonPage = lazy(() => import('../pages/VisualizationsComparisonPage'));
const TrainingVisualizationsComparisonPage = lazy(() => import('../pages/TrainingVisualizationsComparisonPage'));
const BenchmarksPage = lazy(() => import('../pages/BenchmarksPage'));
const ProjectsPage = lazy(() => import('../pages/ProjectsPage'));
const ProjectDashboardPage = lazy(() => import('../pages/ProjectDashboardPage'));

function AppRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDashboardPage />} />
        <Route path="/comparisons/:uuid" element={<ComparisonDetailPage />} />
        <Route path="/trainings" element={<TrainingsPage />} />
        <Route path="/trainings/:id" element={<TrainingDetailPage />} />
        <Route path="/trainings/compare" element={<TrainingComparisonPage />} />
        <Route path="/epochs" element={<EpochsPage />} />
        <Route path="/configs" element={<ConfigsPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/datasets/:id" element={<DatasetDetailPage />} />
        {/* The labeling tool moved to label-front; keep old URLs working. */}
        <Route path="/image-labeling/*" element={<LabelingRedirectPage />} />
        <Route path="/test-results" element={<TestResultsPage />} />
        <Route path="/visualizations" element={<VisualizationsPage />} />
        <Route path="/visualizations/compare" element={<VisualizationsComparisonPage />} />
        <Route path="/visualizations/compare-trainings" element={<TrainingVisualizationsComparisonPage />} />
        <Route path="/benchmarks" element={<BenchmarksPage />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
