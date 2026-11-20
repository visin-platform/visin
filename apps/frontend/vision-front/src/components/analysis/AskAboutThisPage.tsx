import { Box, Button } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../config/ConfigProvider';

/**
 * Opens Vivi beside a page that has no project or run of its own to hand over (a dataset, a suite, a leaderboard, an
 * evaluation). The page itself is the subject, named by its address: the server reads what it names as the person
 * asking. The address goes with the request, since on a phone or outside the shell chat opens in place of this page
 * and cannot see it. Only for someone signed in, since chat is.
 */
export default function AskAboutThisPage({ title, label = 'Ask Vivi about this' }: { title: string; label?: string }) {
  const { isAuthenticated } = useAuth();
  const config = useConfig();
  const open = () => {
    const page = `${window.location.pathname}${window.location.search}`;
    const detail = { kind: 'assistant', title, page };
    // Outside the shell, chat is a page of the shell: go there. The shell's panel is what can see this page.
    if (window.top === window && !document.getElementById('shell-root') && config.SHELL_FRONT_URL) {
      const url = new URL('/chat', config.SHELL_FRONT_URL);
      url.searchParams.set('title', title);
      url.searchParams.set('page', page);
      window.location.assign(url.href);
    } else window.dispatchEvent(new CustomEvent('visin:open-chat', { detail }));
  };
  if (!isAuthenticated) return null;
  return (
    // On a phone the words go and the icon stays: a header has no room for a long label, and the name is still there.
    <Button
      size="small"
      aria-label={label}
      title={label}
      startIcon={<AutoAwesome />}
      onClick={open}
      sx={{ flexShrink: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } } }}
    >
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {label}
      </Box>
    </Button>
  );
}
