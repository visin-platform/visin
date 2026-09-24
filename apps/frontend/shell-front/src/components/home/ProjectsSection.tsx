import { useTheme } from '@mui/material';
import { livePalette } from '@visin/frontend-core';
import { Folder } from '@mui/icons-material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { HomeProject } from '../../services/homeApi';
import { formatRelative } from './formatting';
import { HomeSection, ListRow, RowIcon, SectionBody } from './HomeSection';

const SHOWN = 5;

export function ProjectsSection({ query, now }: { query: UseQueryResult<HomeProject[]>; now: Date }) {
  const theme = useTheme();

  return (
    <HomeSection id="home-projects" title="Projects" seeAll={{ to: '/projects', label: 'See all projects' }}>
      <SectionBody
        query={query}
        items={query.data?.slice(0, SHOWN)}
        empty="No projects yet."
        error="Could not load projects."
      >
        {(project) => (
          <ListRow
            key={project._id}
            to={`/projects/${project.slug || project._id}`}
            leading={
              <RowIcon color={livePalette(theme).primary.main}>
                <Folder fontSize="small" />
              </RowIcon>
            }
            title={project.name}
            secondary={`${project.isPublic ? 'Public' : 'Private'} · ${formatRelative(project.updatedAt, now)}`}
          />
        )}
      </SectionBody>
    </HomeSection>
  );
}
