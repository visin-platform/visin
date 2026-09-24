import { useState } from 'react';
import { Box, Button, Drawer, List, ListItem, ListItemButton, ListItemText, ListSubheader } from '@mui/material';
import { MenuBook } from '@mui/icons-material';
import { NavLink } from 'react-router-dom';
import { API_REFERENCE_PATH, DOC_SECTIONS, docPath } from '../pages';

function PageList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box component="nav" aria-label="Docs">
      {DOC_SECTIONS.map((section) => (
        <List
          key={section.title}
          dense
          subheader={
            <ListSubheader disableSticky sx={{ bgcolor: 'transparent', fontWeight: 700, lineHeight: 2.5, px: 1.5 }}>
              {section.title}
            </ListSubheader>
          }
        >
          {section.pages.map((page) => (
            // In an <li>: a link straight inside the <ul> is not a list item to a screen reader.
            <ListItem key={page.slug} disablePadding>
              <ListItemButton
                component={NavLink}
                to={docPath(page)}
                end
                onClick={onNavigate}
                sx={{
                  borderRadius: '8px',
                  px: 1.5,
                  color: 'text.secondary',
                  // Dark on the selected tint: the brand blue on it is below AA contrast.
                  '&.active': { bgcolor: 'action.selected', color: 'primary.dark', fontWeight: 600 }
                }}
              >
                <ListItemText primary={page.title} slotProps={{ primary: { sx: { fontWeight: 'inherit' } } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      ))}
      <List
        dense
        subheader={
          <ListSubheader disableSticky sx={{ bgcolor: 'transparent', fontWeight: 700, lineHeight: 2.5, px: 1.5 }}>
            Reference
          </ListSubheader>
        }
      >
        {/* A full page load, like every way in and out of the reference: its styles stay on its own page. */}
        <ListItem disablePadding>
          <ListItemButton
            component="a"
            href={API_REFERENCE_PATH}
            sx={{ borderRadius: '8px', px: 1.5, color: 'text.secondary' }}
          >
            <ListItemText primary="API reference" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );
}

/** Every docs page by section: a column beside the page, or a drawer on a phone. */
export default function DocsSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ position: 'sticky', top: 88 }}>
          <PageList />
        </Box>
      </Box>

      <Box sx={{ display: { md: 'none' } }}>
        <Button startIcon={<MenuBook />} onClick={() => setOpen(true)} variant="outlined" size="small">
          Docs menu
        </Button>
        <Drawer
          anchor="left"
          open={open}
          onClose={() => setOpen(false)}
          slotProps={{ paper: { sx: { width: 280, p: 1 } } }}
        >
          <PageList onNavigate={() => setOpen(false)} />
        </Drawer>
      </Box>
    </>
  );
}
