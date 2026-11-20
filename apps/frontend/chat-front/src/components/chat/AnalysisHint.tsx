import { Typography } from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { StarterQuestions } from './StarterQuestions';
import { useCurrentPath } from '../../utils/screen';

/**
 * What an empty analysis says: what can be asked, in a line, and questions that fit the page beside the chat. The
 * question itself is the asker's: in a chat that exists a starter is sent; before one exists it fills the box, for the
 * person to read and send.
 */
export function AnalysisHint() {
  const { c, enabled, sending, post, ask, about, panel } = useChatWorkspaceContext();
  const shown = useCurrentPath();
  // The page the questions will be about: the one beside the panel, or the one asked about from a phone.
  const path = panel ? shown : (about?.page ?? shown);
  return (
    <>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 4, px: 2 }}>
        Ask about results, projects, datasets, papers or your next experiment.
      </Typography>
      {enabled && (
        <StarterQuestions
          path={path}
          disabled={sending}
          onPick={(question) => (c ? void post(question, false) : ask(question))}
        />
      )}
    </>
  );
}
