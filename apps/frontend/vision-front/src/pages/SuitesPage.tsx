import React from 'react';
import {
  Alert,
  Chip,
  CircularProgress,
  Container,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { Rule as SuiteIcon } from '@mui/icons-material';
import { EmptyState, PageHeader } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { suiteService } from '../services/evaluationService';
import { formatDate } from '../utils';

const SuitesPage: React.FC = () => {
  usePageTitle('Suites');
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['suites'], queryFn: () => suiteService.list({ limit: 100 }) });
  const suites = data?.suites ?? [];

  let content: React.ReactNode;
  if (isLoading) content = <CircularProgress />;
  else if (isError) content = <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load suites'}</Alert>;
  else if (suites.length === 0) {
    content = (
      <EmptyState
        icon={<SuiteIcon />}
        title="No suites yet"
        description="A suite is a written-down way of scoring a model. Publish one from your evaluation script, then record results on it."
      />
    );
  } else {
    content = (
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Suite</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Task</TableCell>
              <TableCell>Visibility</TableCell>
              <TableCell>Published</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {suites.map(suite => (
              <TableRow key={suite._id} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/suites/${suite.slug}/${suite.version}`}>{suite.slug}@{suite.version}</Link>
                  {suite.archivedAt && <Chip size="small" label="Archived" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{suite.name}</TableCell>
                <TableCell>{suite.protocol.task}</TableCell>
                <TableCell>{suite.visibility === 'public' ? 'Public' : 'Private'}</TableCell>
                <TableCell>{formatDate(suite.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageHeader title="Suites" subtitle="How models are scored. Results on one suite version can be compared; a published version never changes." />
      {content}
    </Container>
  );
};

export default SuitesPage;
