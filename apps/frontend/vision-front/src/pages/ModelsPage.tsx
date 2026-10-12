import React from 'react';
import { Container } from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import ModelRegistry from '../components/models/ModelRegistry';
import { usePageTitle } from '../hooks/usePageTitle';

const ModelsPage: React.FC = () => {
  usePageTitle('Models');
  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageHeader
        title="Models"
        subtitle="Checkpoints your runs published, kept on Visin to download or linked on the Hugging Face Hub. Rank them by a result to find the one to use."
      />
      <ModelRegistry />
    </Container>
  );
};

export default ModelsPage;
