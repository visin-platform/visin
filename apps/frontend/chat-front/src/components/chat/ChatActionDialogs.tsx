import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { displayTitle } from '../../utils/chatContext';

/**
 * The two answers to what a person does to a conversation: deleting asks first, because nothing brings it back in the
 * app; putting one away does not ask, and offers it back for a moment instead.
 */
export function ChatActionDialogs({ panel = false }: { panel?: boolean }) {
  const { deleting, askDelete, deleteChat, justHidden, forgetJustHidden, unhideChat, user } =
    useChatWorkspaceContext();
  return (
    <>
      <Dialog open={Boolean(deleting)} onClose={() => askDelete(undefined)} aria-labelledby="delete-chat-title">
        <DialogTitle id="delete-chat-title">
          Delete your chat{deleting ? ` with ${displayTitle(deleting, user?.id)}` : ''}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            You won’t be able to open it again. Findings it recorded are kept. If you want it out of the way for now,
            hide it instead.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => askDelete(undefined)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              const chat = deleting;
              askDelete(undefined);
              if (chat) void deleteChat(chat._id);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(justHidden)}
        autoHideDuration={6000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') forgetJustHidden();
        }}
        message={justHidden ? `${displayTitle(justHidden, user?.id)} hidden` : ''}
        // Beside the chat panel, not over the middle of the page it sits next to.
        anchorOrigin={{ vertical: 'bottom', horizontal: panel ? 'right' : 'center' }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              const chat = justHidden;
              forgetJustHidden();
              if (chat) void unhideChat(chat._id);
            }}
          >
            Undo
          </Button>
        }
      />
    </>
  );
}
