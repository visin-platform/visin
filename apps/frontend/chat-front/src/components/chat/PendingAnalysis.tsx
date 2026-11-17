import { Box, Divider, Stack, Typography } from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { AnalysisHint } from './AnalysisHint';
import { AnalystSetupNotice } from './AnalystSetupNotice';
import { BackToConversations } from './BackToConversations';
import { AskingAbout } from './AskingAbout';
import { Composer } from './Composer';

export function PendingAnalysis({ panel }: { panel: boolean }) {
  const { show, pending, enabled, canConfigure, draft, setDraft, send, sending, composerInput, about, clearAbout } =
    useChatWorkspaceContext();
  if (!pending) return null;
  return (
    <>
      <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', gap: 1 }}>
        <BackToConversations panel={panel} onBack={() => show(undefined)} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            Ask the assistant
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            New chat · only you can read it
          </Typography>
        </Box>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}><AnalysisHint /></Box>
      {!enabled && <AnalystSetupNotice canConfigure={canConfigure} />}
      <AskingAbout about={about} onClear={clearAbout} />
      <Composer
        label="Ask the analyst"
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        sending={sending}
        inputRef={composerInput}
        hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
        disabled={!enabled}
        commands
      />
    </>
  );
}
