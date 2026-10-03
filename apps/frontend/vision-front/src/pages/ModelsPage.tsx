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
        subtitle="Models your runs published to Hugging Face. Rank them by a result to find the one to use."
      />
      <ModelRegistry />
    </Container>
  );
};

export default ModelsPage;
