import { useTheme } from '@mui/material';
import { AutoAwesome, EditNote } from '@mui/icons-material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { HomeFinding } from '../../services/homeApi';
import { formatRelative } from './formatting';
import { HomeSection, ListRow, RowIcon, SectionBody } from './HomeSection';

interface FindingsSectionProps {
  query: UseQueryResult<HomeFinding[]>;
  projectNames: Map<string, string>;
  now: Date;
}

/**
 * The latest written conclusions, most of them an assistant's. Each opens where
 * it is kept: the run it is about, or its project's Analysis tab.
 *
 * Whether software wrote a finding is stated, never left to be inferred — in
 * the text, not only the icon.
 */
export function FindingsSection({ query, projectNames, now }: FindingsSectionProps) {
  const theme = useTheme();

  return (
    <HomeSection id="home-findings" title="Recent analysis">
      <SectionBody
        query={query}
        items={query.data}
        empty="No analysis yet. Findings an assistant or a teammate records show up here."
        error="Could not load analysis."
      >
        {(finding) => {
          const assistant = finding.authorKind === 'assistant';
          const author = assistant ? `AI · ${finding.authorLabel}` : finding.authorLabel;
          return (
            <ListRow
              key={finding._id}
              to={
                finding.trainingId
                  ? `/trainings/${finding.trainingId}`
                  : `/projects/${finding.projectId}?tab=analysis`
              }
              leading={
                assistant ? (
                  <RowIcon color={theme.palette.primary.main}>
                    <AutoAwesome fontSize="small" />
                  </RowIcon>
                ) : (
                  <RowIcon color={theme.palette.text.secondary}>
                    <EditNote fontSize="small" />
                  </RowIcon>
                )
              }
              title={finding.title}
              secondary={[author, projectNames.get(finding.projectId), formatRelative(finding.createdAt, now)]
                .filter(Boolean)
                .join(' · ')}
            />
          );
        }}
      </SectionBody>
    </HomeSection>
  );
}
