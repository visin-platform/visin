import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Tab, Tabs } from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import { useAnalystCapabilities, useChatConfigured } from '../../hooks/useAnalyst';
import AnalystSetup from './AnalystSetup';
import AnalystUsage from './AnalystUsage';

const SUBTITLE = 'The assistant that answers questions about training results in chat.';

type View = 'setup' | 'usage';

/**
 * Account's Analyst section, for platform administrators: how it is set up, and what it has used and cost.
 *
 * The service checks the role on every call, so a visitor who types the address gets the explanation below
 * rather than a form. The view is in the address (`?view=usage`), so a link opens it, and going back works.
 */
const AnalystTab: React.FC = () => {
  const configured = useChatConfigured();
  const capabilities = useAnalystCapabilities();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'usage' ? 'usage' : 'setup';

  if (!configured) {
    return (
      <>
        <PageHeader subtitle={SUBTITLE} />
        <Alert severity="info">Chat is not set up for this deployment.</Alert>
      </>
    );
  }
  if (capabilities.isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (capabilities.data?.canConfigure !== true) {
    return (
      <>
        <PageHeader subtitle={SUBTITLE} />
        <Alert severity={capabilities.isError ? 'warning' : 'info'}>
          {capabilities.isError
            ? 'Chat could not be reached, so these settings cannot be shown. Try again later.'
            : 'Only administrators can change the analyst settings.'}
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader subtitle={SUBTITLE} />
      <Tabs
        value={view}
        onChange={(_event, next: View) => setParams(next === 'usage' ? { view: 'usage' } : {})}
        aria-label="Analyst"
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="setup" label="Setup" />
        <Tab value="usage" label="Usage and cost" />
      </Tabs>
      {view === 'usage' ? <AnalystUsage /> : <AnalystSetup />}
    </>
  );
};

export default AnalystTab;
