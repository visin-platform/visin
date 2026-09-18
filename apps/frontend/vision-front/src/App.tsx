import { BrowserRouter as Router } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import UploadPanel from './components/dataset/UploadPanel';
import AppRoutes from './routes';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
        {/* Beside the routes, not in a page: moving around never hides a running
            upload. Inside shell-front the shell renders it instead (./Uploads). */}
        <UploadPanel />
      </AuthProvider>
    </Router>
  );
}

export default App;
