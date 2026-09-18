import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import ShellLayout from './components/ShellLayout';
import ShellRoutes from './routes';
import VisionUploads from './components/VisionUploads';

// The shell's own queries: the home page's. Each remote brings its own client,
// nearer its hooks than this one.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } }
});

/**
 * The one page every app renders into. The menu is mounted once, here, and
 * stays mounted: moving between Vision, Labeling and Account swaps only the
 * content under it, where a separate front used to mean a full page load.
 */
function App() {
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ShellLayout>
            <ShellRoutes />
          </ShellLayout>
          <VisionUploads />
        </AuthProvider>
      </QueryClientProvider>
    </Router>
  );
}

export default App;
