import React from 'react';
import { Container } from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import EvaluationList from '../components/evaluations/EvaluationList';
import { usePageTitle } from '../hooks/usePageTitle';

const EvaluationsPage: React.FC = () => {
  usePageTitle('Evaluations');
  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageHeader
        title="Evaluations"
        subtitle="Checkpoints scored on a suite, each with whether it can be ranked. Open one to see why."
      />
      <EvaluationList />
    </Container>
  );
};

export default EvaluationsPage;
