import { Button } from '@mui/material';

/** Account runs standalone too; the shell owns chat navigation. */
export function OpenChatButton({
  request,
  label = 'Open chat',
  disabled = false
}: {
  request: { kind: 'group'; groupId: string } | { kind: 'direct'; userId: string; name: string };
  label?: string;
  disabled?: boolean;
}) {
  if (!document.getElementById('shell-root')) return null;
  return (
    <Button
      size="small"
      disabled={disabled}
      onClick={() => window.dispatchEvent(new CustomEvent('visin:open-chat', { detail: request }))}
    >
      {label}
    </Button>
  );
}
