import { Button } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../config/ConfigProvider';
export default function AnalyzeButton({
  projectId,
  trainingIds,
  title,
  discussion = false
}: {
  projectId?: string;
  trainingIds: string[];
  title: string;
  discussion?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const config = useConfig();
  const open = () => {
    const detail = { projectId, trainingIds, title, kind: discussion ? 'project' : 'assistant' };
    if (window.top === window && !document.getElementById('shell-root') && config.SHELL_FRONT_URL) {
      const url = new URL('/chat', config.SHELL_FRONT_URL);
      if (projectId) url.searchParams.set('project', projectId);
      url.searchParams.set('runs', trainingIds.join(','));
      url.searchParams.set('title', title);
      if (discussion) url.searchParams.set('kind', 'project');
      window.location.assign(url.href);
    } else window.dispatchEvent(new CustomEvent('visin:open-chat', { detail }));
  };
  if (!isAuthenticated || !projectId) return null;
  return (
    <Button startIcon={<AutoAwesome />} onClick={open}>
      {discussion ? 'Discuss project' : trainingIds.length > 1 ? 'Analyze comparison' : 'Analyze this run'}
    </Button>
  );
}
