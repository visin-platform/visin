import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Collapse, Link, Stack, Tooltip, Typography } from '@mui/material';
import CodeSnippet from '../project/CodeSnippet';
import type { Provenance } from '../../types/training';
import { commitUrl } from '../../utils/commitUrl';

interface ProvenanceCardProps {
  provenance: Provenance;
}

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
      {value}
    </Typography>
  </Box>
);

/**
 * What this run was started from, in a line or two: the commit (linked to its repository where that is known), the
 * branch, the machine and the Python and CUDA it ran on. The exact command and the package list are behind one
 * disclosure, since they are long and are rarely what someone came for.
 *
 * Local changes are a quiet note beside the commit, not a warning: a working tree is nearly always dirty (logs,
 * scheduler output, untracked files), so a banner on every run says nothing.
 */
const ProvenanceCard: React.FC<ProvenanceCardProps> = ({ provenance }) => {
  const [showMore, setShowMore] = useState(false);
  const { git, command, host, packages } = provenance;
  const names = Object.keys(packages ?? {});
  const url = git ? commitUrl(git.remote, git.commit) : undefined;
  const short = git?.commit.slice(0, 7);
  const hasMore = Boolean(command) || names.length > 0;

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mb: 2 }}>
          Reproducibility
        </Typography>
        <Stack direction="row" useFlexGap spacing={3} sx={{ flexWrap: 'wrap' }}>
          {git && (
            <>
              <Fact
                label="Commit"
                value={
                  <>
                    {url ? (
                      <Link href={url} target="_blank" rel="noopener noreferrer">
                        <code>{short}</code>
                      </Link>
                    ) : (
                      <code>{short}</code>
                    )}
                    {git.dirty && (
                      <Tooltip title="The working tree had changes or untracked files when the run started, so the commit may not be exactly the code that ran.">
                        <Chip size="small" variant="outlined" label="local changes" sx={{ ml: 1 }} />
                      </Tooltip>
                    )}
                  </>
                }
              />
              {git.branch && <Fact label="Branch" value={git.branch} />}
            </>
          )}
          {host?.hostname && <Fact label="Machine" value={host.hostname} />}
          {host?.python && <Fact label="Python" value={host.python} />}
          {host?.cuda && <Fact label="CUDA" value={host.cuda} />}
        </Stack>
        {hasMore && (
          <>
            <Button size="small" sx={{ mt: 1.5, ml: -1 }} onClick={() => setShowMore((open) => !open)} aria-expanded={showMore}>
              {showMore
                ? 'Hide command and packages'
                : names.length > 0
                  ? `Command and ${names.length} packages`
                  : 'Command'}
            </Button>
            <Collapse in={showMore} unmountOnExit>
              {command && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Command
                  </Typography>
                  <CodeSnippet code={command} label="command" />
                </Box>
              )}
              {names.length > 0 && (
                <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mt: 1.5 }} aria-label="Packages">
                  {names.map((name) => (
                    <Chip key={name} size="small" variant="outlined" label={`${name} ${packages![name]}`} />
                  ))}
                </Stack>
              )}
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProvenanceCard;
