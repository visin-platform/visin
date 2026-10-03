import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, Stack, Typography } from '@mui/material';
import CodeSnippet from '../project/CodeSnippet';
import type { Provenance } from '../../types/training';

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
 * What this run was started from: the code (commit, branch, whether the tree was
 * dirty), the exact command, the machine and the packages. Recorded by the
 * client, so a result can be reproduced without anyone having noted it down. A
 * dirty tree is called out: the commit then does not name the code that ran.
 */
const ProvenanceCard: React.FC<ProvenanceCardProps> = ({ provenance }) => {
  const [showPackages, setShowPackages] = useState(false);
  const { git, command, host, packages } = provenance;
  const names = Object.keys(packages ?? {});

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mb: 2 }}>
          Reproducibility
        </Typography>
        {git?.dirty && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This run started with uncommitted changes, so commit {git.commit.slice(0, 7)} alone does not give back the
            code that ran.
          </Alert>
        )}
        <Stack direction="row" useFlexGap spacing={3} sx={{ flexWrap: 'wrap', mb: 2 }}>
          {git && (
            <>
              <Fact label="Commit" value={<code>{git.commit.slice(0, 7)}</code>} />
              {git.branch && <Fact label="Branch" value={git.branch} />}
              {git.remote && <Fact label="Repository" value={git.remote} />}
            </>
          )}
          {host?.hostname && <Fact label="Machine" value={host.hostname} />}
          {host?.platform && <Fact label="Platform" value={host.platform} />}
          {host?.python && <Fact label="Python" value={host.python} />}
          {host?.cuda && <Fact label="CUDA" value={host.cuda} />}
        </Stack>
        {command && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Command
            </Typography>
            <CodeSnippet code={command} label="command" />
          </Box>
        )}
        {names.length > 0 && (
          <>
            <Button size="small" onClick={() => setShowPackages((open) => !open)}>
              {showPackages ? 'Hide packages' : `Show ${names.length} packages`}
            </Button>
            <Collapse in={showPackages} unmountOnExit>
              <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mt: 1 }} aria-label="Packages">
                {names.map((name) => (
                  <Chip key={name} size="small" variant="outlined" label={`${name} ${packages![name]}`} />
                ))}
              </Stack>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProvenanceCard;
