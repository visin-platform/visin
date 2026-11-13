import { BrowserRouter as Router } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import { ObservabilityNavigation } from './components/ObservabilityNavigation';
import AppRoutes from './routes';

function App() {
  return (
    <Router>
      <ObservabilityNavigation />
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </Router>
  );
}

export default App;
