import { Button } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestVivi } from '../../hooks/useGuestVivi';

/**
 * "Ask Vivi about this project", for someone who has not signed in: opens the shell's Vivi panel on this public
 * project. Offered only where it works (the project is public and guest Vivi is on), and left to AnalyzeButton once
 * someone is signed in, who gets the full analyst.
 */
export default function AskViviButton({
  projectId,
  title,
  visibility
}: {
  projectId: string;
  title: string;
  visibility?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const guestVivi = useGuestVivi();
  if (isAuthenticated || isLoading || !guestVivi || visibility !== 'public') return null;
  return (
    <Button
      startIcon={<AutoAwesome />}
      onClick={() =>
        window.dispatchEvent(new CustomEvent('visin:open-chat', { detail: { kind: 'project', projectId, title } }))
      }
    >
      Ask Vivi about this project
    </Button>
  );
}
