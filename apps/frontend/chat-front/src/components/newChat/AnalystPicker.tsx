import { AutoAwesome, FolderOutlined, HelpOutlined } from '@mui/icons-material';
import { Box, Button, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import type { ChatProject, PageContext } from '../../types/chat';
import { Assistants } from '../assistants/Assistants';
import { Section } from './NewChatSection';
export function AnalystPicker({
  pageContext,
  assistant,
  setupHref,
  busy,
  onAnalysis,
  projects,
  showAssistants = true
}: {
  pageContext?: PageContext;
  assistant: boolean;
  setupHref?: string;
  busy: boolean;
  onAnalysis: (context: PageContext) => void;
  projects: ChatProject[];
  showAssistants?: boolean;
}) {
  return (
    <Section
      icon={<AutoAwesome />}
      title="Ask the analyst"
      note={
        assistant
          ? 'A private conversation about results you can see. Only you can read it.'
          : setupHref
            ? 'The analyst is not turned on yet.'
            : 'The analyst is not turned on for this deployment. Ask an administrator.'
      }
    >
      {!assistant && setupHref && (
        <Button variant="outlined" component="a" href={setupHref}>
          Set up the analyst
        </Button>
      )}
      {assistant && (
        <List dense disablePadding aria-label="Analyse">
          {pageContext?.projectId && (
            <ListItemButton disabled={busy} onClick={() => onAnalysis(pageContext)} sx={{ borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <AutoAwesome fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={pageContext.title || 'This page'} secondary="What you are looking at" />
            </ListItemButton>
          )}
          <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
            {projects.map((project) => (
              <ListItemButton
                key={project._id}
                disabled={busy}
                onClick={() =>
                  onAnalysis({
                    projectId: project._id,
                    trainingIds: [],
                    title: project.name,
                    projectName: project.name
                  })
                }
                sx={{ borderRadius: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FolderOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={project.name} />
              </ListItemButton>
            ))}
          </Box>
          <ListItemButton
            disabled={busy}
            onClick={() => onAnalysis({ title: 'General question' })}
            sx={{ borderRadius: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <HelpOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="General question" secondary="Not about one project" />
          </ListItemButton>
        </List>
      )}
      {showAssistants && <Assistants busy={busy || !assistant} onAnalysis={onAnalysis} pageContext={pageContext} />}
    </Section>
  );
}
