import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ShellLayout from './components/ShellLayout';
import ShellRoutes from './routes';

/**
 * The one page every app renders into. The menu is mounted once, here, and
 * stays mounted: moving between Vision, Labeling and Account swaps only the
 * content under it, where a separate front used to mean a full page load.
 */
function App() {
  return (
    <Router>
      <AuthProvider>
        <ShellLayout>
          <ShellRoutes />
        </ShellLayout>
      </AuthProvider>
    </Router>
  );
}

export default App;
