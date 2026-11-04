import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useLayoutEffect, useState } from 'react';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { chatService } from '../../services/chatService';

import { mergeMessages } from '../../utils/messages';

export function FindingDialog() {
  const [findingTitle, setFindingTitle] = useState('');
  const [findingBody, setFindingBody] = useState('');
  const [findingRecommendations, setFindingRecommendations] = useState('');
  const { finding, setFinding, perform, selected, c, setMessages } = useChatWorkspaceContext();

  useLayoutEffect(() => {
    setFindingTitle('');
    setFindingBody(finding?.body || '');
    setFindingRecommendations('');
  }, [finding]);
  return (
    <Dialog open={Boolean(finding)} onClose={() => setFinding(undefined)} fullWidth maxWidth="md">
      <DialogTitle>Review finding</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Title" value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} />
          <TextField
            label="Conclusion"
            multiline
            minRows={8}
            value={findingBody}
            onChange={(e) => setFindingBody(e.target.value)}
          />
          <TextField
            label="Suggested next experiment (optional)"
            multiline
            value={findingRecommendations}
            onChange={(e) => setFindingRecommendations(e.target.value)}
          />
          <Typography variant="caption">
            Saving uses your existing project write permission and preserves assistant attribution.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setFinding(undefined)}>Cancel</Button>
        <Button
          disabled={!findingTitle.trim()}
          onClick={() =>
            void perform(async () => {
              await chatService.saveFinding(selected!, {
                messageId: finding!._id,
                title: findingTitle,
                body: findingBody,
                recommendations: findingRecommendations || undefined
              });
              setFinding(undefined);
              window.dispatchEvent(new CustomEvent('visin:finding-saved', { detail: { projectId: c?.projectId } }));
              const rows = await chatService.messages(selected!);
              setMessages((old) => mergeMessages(old, rows));
            })
          }
        >
          Save finding
        </Button>
      </DialogActions>
    </Dialog>
  );
}
