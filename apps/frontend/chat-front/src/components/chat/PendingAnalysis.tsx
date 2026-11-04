import { Box, Divider, Stack, Typography } from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { AnalysisStarters } from './AnalysisStarters';
import { AnalystSetupNotice } from './AnalystSetupNotice';
import { BackToConversations } from './BackToConversations';
import { ChatContextChips } from './ChatContextChips';
import { Composer } from './Composer';

export function PendingAnalysis({ panel }: { panel: boolean }) {
  const { show, pending, ask, enabled, canConfigure, draft, setDraft, send, sending, composerInput } =
    useChatWorkspaceContext();
  if (!pending) return null;
  return (
    <>
      <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', gap: 1 }}>
        <BackToConversations panel={panel} onBack={() => show(undefined)} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            {pending.title || 'New analysis'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            New analysis · only you can read it
          </Typography>
        </Box>
      </Stack>
      {
        <ChatContextChips
          context={pending}
          labels={
            pending.trainingIds?.length === 1 && pending.title
              ? [{ id: pending.trainingIds[0], name: pending.title }]
              : undefined
          }
        />
      }
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>{<AnalysisStarters context={pending} onAsk={ask} />}</Box>
      {!enabled && <AnalystSetupNotice canConfigure={canConfigure} />}
      <Composer
        label="Ask the analyst"
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        sending={sending}
        inputRef={composerInput}
        hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
        disabled={!enabled}
      />
    </>
  );
}
