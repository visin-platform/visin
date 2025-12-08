import { Routes, Route, Navigate } from 'react-router-dom';
import TrainingsPage from '../pages/TrainingsPage';
import TrainingDetailPage from '../pages/TrainingDetailPage';
import TrainingComparisonPage from '../pages/TrainingComparisonPage';
import EpochsPage from '../pages/EpochsPage';
import ConfigsPage from '../pages/ConfigsPage';
import DatasetsPage from '../pages/DatasetsPage';
import DatasetComparisonPage from '../pages/DatasetComparisonPage';
import DatasetDetailPage from '../pages/DatasetDetailPage';
import ImageLabelingPage from '../pages/ImageLabelingPage';
import TestResultsPage from '../pages/TestResultsPage';
import TestResultsComparisonPage from '../pages/TestResultsComparisonPage';
import VisualizationsPage from '../pages/VisualizationsPage';
import VisualizationsComparisonPage from '../pages/VisualizationsComparisonPage';
import TrainingVisualizationsComparisonPage from '../pages/TrainingVisualizationsComparisonPage';
import BenchmarksPage from '../pages/BenchmarksPage';
import ComparisonsPage from '../pages/ComparisonsPage';
import ProjectsPage from '../pages/ProjectsPage';
import ProjectDashboardPage from '../pages/ProjectDashboardPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDashboardPage />} />
      <Route path="/trainings" element={<TrainingsPage />} />
      <Route path="/trainings/:id" element={<TrainingDetailPage />} />
      <Route path="/trainings/compare" element={<TrainingComparisonPage />} />
      <Route path="/epochs" element={<EpochsPage />} />
      <Route path="/configs" element={<ConfigsPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/datasets/:id" element={<DatasetDetailPage />} />
      <Route path="/datasets/compare" element={<DatasetComparisonPage />} />
      <Route path="/image-labeling" element={<ImageLabelingPage />} />
      <Route path="/image-labeling/:imageId" element={<ImageLabelingPage />} />
      <Route path="/test-results" element={<TestResultsPage />} />
      <Route path="/test-results/compare" element={<TestResultsComparisonPage />} />
      <Route path="/visualizations" element={<VisualizationsPage />} />
      <Route path="/visualizations/compare" element={<VisualizationsComparisonPage />} />
      <Route path="/visualizations/compare-trainings" element={<TrainingVisualizationsComparisonPage />} />
      <Route path="/benchmarks" element={<BenchmarksPage />} />
      <Route path="/comparisons" element={<ComparisonsPage />} />
    </Routes>
  );
}

export default AppRoutes;
