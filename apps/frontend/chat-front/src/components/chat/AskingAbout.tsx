import { ArticleOutlined, Close, FolderOutlined } from '@mui/icons-material';
import { Chip, IconButton, Stack } from '@mui/material';
import type { PageContext } from '../../types/chat';
import { aboutLabel } from '../../utils/chatContext';

/**
 * What the next question is about, above the box it is typed in: the page the person is on, or what they asked to
 * open the chat on. A hint more than a control; clearing it makes the next question a general one.
 */
export function AskingAbout({
  about,
  name,
  onClear
}: {
  about?: PageContext;
  /** Who is asked, for "Vivi sees". */
  name?: string;
  onClear: () => void;
}) {
  const label = aboutLabel(about);
  if (!label) return null;
  return (
    <Stack direction="row" sx={{ px: 2, pb: 0.5, pt: 0.5, alignItems: 'center', gap: 0.5 }}>
      <Chip
        size="small"
        variant="outlined"
        icon={about?.paperId ? <ArticleOutlined /> : <FolderOutlined />}
        label={`${name || 'The assistant'} sees: ${label}`}
        sx={{ maxWidth: 'calc(100% - 32px)', color: 'text.secondary' }}
      />
      <IconButton size="small" aria-label="Ask a general question instead" onClick={onClear}>
        <Close fontSize="small" />
      </IconButton>
    </Stack>
  );
}
