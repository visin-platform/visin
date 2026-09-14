import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Assignment, Folder, ModelTraining, PlayArrow } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { homeApi, remainingTasks } from '../services/homeApi';
import { GreetingHeader } from '../components/home/GreetingHeader';
import { QuickActions } from '../components/home/QuickActions';
import { StatTiles, type StatTile } from '../components/home/StatTiles';
import { TrainingsSection } from '../components/home/TrainingsSection';
import { ProjectsSection } from '../components/home/ProjectsSection';
import { LabelingSection } from '../components/home/LabelingSection';
import { FindingsSection } from '../components/home/FindingsSection';

const RECENT_TRAININGS = 5;
const RECENT_FINDINGS = 4;

interface HomePageProps {
  userName?: string;
  /** Injectable so a test need not freeze the clock. */
  now?: Date;
}

/**
 * Where a signed-in session opens. Built like the first screen of a phone app
 * rather than a web page: a title, one-tap shortcuts, the few numbers worth a
 * glance, then what changed, as grouped lists. From md up the lists sit in two
 * columns and the same page reads as a dashboard.
 *
 * Each part is fed by one service and left out where that service's URL is not
 * configured, rather than shown failing.
 */
export function HomePage({ userName, now }: HomePageProps) {
  const config = useConfig();
  const vision = Boolean(config.VISION_API_URL);
  const label = Boolean(config.LABEL_SERVICE_URL);
  const today = useMemo(() => now ?? new Date(), [now]);

  const recent = useQuery({
    queryKey: ['home', 'trainings', 'recent'],
    queryFn: () => homeApi.trainings({ limit: RECENT_TRAININGS }),
    enabled: vision
  });
  const running = useQuery({
    queryKey: ['home', 'trainings', 'running'],
    queryFn: () => homeApi.trainings({ limit: 1, status: 'running' }),
    enabled: vision
  });
  const projects = useQuery({ queryKey: ['home', 'projects'], queryFn: homeApi.projects, enabled: vision });
  const jobs = useQuery({ queryKey: ['home', 'jobs'], queryFn: homeApi.jobs, enabled: label });
  const findings = useQuery({
    queryKey: ['home', 'findings'],
    queryFn: () => homeApi.findings(RECENT_FINDINGS),
    enabled: vision
  });

  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project._id, project.name])),
    [projects.data]
  );

  const tiles: StatTile[] = [
    ...(vision
      ? [
          {
            label: 'Projects',
            to: '/projects',
            icon: <Folder />,
            value: projects.data?.length,
            loading: projects.isPending,
            failed: projects.isError
          },
          {
            label: 'Trainings',
            to: '/trainings',
            icon: <ModelTraining />,
            value: recent.data?.total,
            loading: recent.isPending,
            failed: recent.isError
          },
          {
            label: 'Running now',
            to: '/trainings',
            icon: <PlayArrow />,
            value: running.data?.total,
            loading: running.isPending,
            failed: running.isError
          }
        ]
      : []),
    ...(label
      ? [
          {
            label: 'Tasks to label',
            to: '/jobs',
            icon: <Assignment />,
            value: jobs.data?.reduce((sum, job) => sum + remainingTasks(job), 0),
            loading: jobs.isPending,
            failed: jobs.isError
          }
        ]
      : [])
  ];

  const column = { display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 }, minWidth: 0 } as const;

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', ...column }}>
      <GreetingHeader name={userName} now={today} />

      <QuickActions apps={{ vision: Boolean(config.VISION_FRONT_URL), label: Boolean(config.LABEL_FRONT_URL) }} />

      {tiles.length > 0 && <StatTiles tiles={tiles} />}

      {/* Two columns from md up, read row by row; one column on a phone in the
          same order: what ran, what there is to label, what was concluded. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gap: { xs: 3, md: 4 },
          alignItems: 'start'
        }}
      >
        {vision && <TrainingsSection query={recent} projectNames={projectNames} now={today} />}
        {label && <LabelingSection query={jobs} />}
        {vision && <FindingsSection query={findings} projectNames={projectNames} now={today} />}
        {vision && <ProjectsSection query={projects} now={today} />}
      </Box>
    </Box>
  );
}

export default HomePage;
