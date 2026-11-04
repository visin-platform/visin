import { FolderOutlined } from '@mui/icons-material';
import { Chip, Stack } from '@mui/material';

export function ChatContextChips({
  context,
  labels
}: {
  context: { projectId?: string; projectName?: string; trainingIds?: string[] };
  labels?: { id: string; name: string }[];
}) {
  return (
    Boolean(context.projectId || context.trainingIds?.length) && (
      <Stack direction="row" sx={{ px: 2, pb: 1, gap: 0.5, flexWrap: 'wrap' }}>
        {context.trainingIds?.map((id) => (
          <Chip
            key={id}
            size="small"
            component="a"
            href={`/trainings/${id}`}
            clickable
            label={labels?.find((run) => run.id === id)?.name || `Run ${id.slice(-6)}`}
          />
        ))}
        {context.projectId && (
          <Chip
            size="small"
            component="a"
            href={`/projects/${context.projectId}`}
            clickable
            icon={<FolderOutlined />}
            label={context.projectName || 'Project'}
          />
        )}
      </Stack>
    )
  );
}
