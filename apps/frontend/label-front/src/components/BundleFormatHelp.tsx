import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Link,
  Stack,
  Typography
} from '@mui/material';
import { ExpandMore, HelpOutlineOutlined } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

// Kept in sync with label-service's `utils/bundlePaths.ts` (entry classification)
// and `utils/manifest.ts` (manifest parsing) — the only two places that define
// what a valid bundle zip contains.
const LAYOUT = `bundle.zip
├── frames/                    required — the images being labelled
│   ├── 0001.jpg
│   └── 0002.jpg               .png .jpg .jpeg .webp
├── annotations/               optional — one folder per annotation set
│   └── llava/                 set name = folder name
│       ├── 0001.png           overlay layer for frame 0001
│       ├── 0001.ids.png       id map: pixel value = mask id
│       └── 0001.masks.json    [{ "id": 1, "class": "car", "bbox": [x1,y1,x2,y2] }]
└── manifest.csv               optional — or manifest.jsonl`;

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <Stack direction="row" spacing={1.5}>
    <Box
      sx={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: '50%',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {n}
    </Box>
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {children}
    </Typography>
  </Stack>
);

const Rule: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography component="li" variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
    {children}
  </Typography>
);

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="code" sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
    {children}
  </Box>
);

/** Collapsed reference for how to build and upload a bundle zip. */
const BundleFormatHelp: React.FC = () => (
  <Accordion
    disableGutters
    variant="outlined"
    sx={{ borderRadius: 3, '&:before': { display: 'none' }, overflow: 'hidden' }}
  >
    <AccordionSummary expandIcon={<ExpandMore />}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <HelpOutlineOutlined fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          How to upload a bundle
        </Typography>
      </Stack>
    </AccordionSummary>
    <AccordionDetails>
      <Stack spacing={1.5}>
        <Step n={1}>
          <strong>New bundle</strong> — name it and pick a group. Only groups you own or administer can hold
          bundles; everyone in that group can then use it in jobs.
        </Step>
        <Step n={2}>
          <strong>Upload zip</strong> on the bundle card. The zip is uploaded and then read to see what it
          contains — nothing is imported yet.
        </Step>
        <Step n={3}>
          <strong>Map the folders</strong> in the dialog that opens: each folder in the zip becomes frames, an
          annotation set, or is ignored. A zip in the layout below arrives pre-filled, so it's one click; a zip
          with its own folder names is mapped here instead of being repacked. Progress and any per-file problems
          are reported on the card, and the bundle turns <Code>ready</Code> once at least one frame imported.
        </Step>
        <Step n={4}>
          Create a job from the bundle on the{' '}
          <Link component={RouterLink} to="/jobs/new">
            new job
          </Link>{' '}
          page, choosing which annotation sets it shows.
        </Step>

        <Divider />

        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Default zip layout
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'action.hover',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.6,
            overflowX: 'auto'
          }}
        >
          {LAYOUT}
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Rules
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          <Rule>
            <strong>The filename stem is the link key.</strong> <Code>frames/0001.jpg</Code> pairs with{' '}
            <Code>annotations/llava/0001.png</Code>, <Code>annotations/llava/0001.ids.png</Code> and{' '}
            <Code>annotations/llava/0001.masks.json</Code>. Extensions may differ; the stem must match exactly.
          </Rule>
          <Rule>
            <strong>Only <Code>frames/</Code> is required.</strong> A bundle with no <Code>annotations/</Code> folder
            imports fine — annotation sets can be added by uploading another zip later. The older folder name{' '}
            <Code>ann/</Code> is still accepted.
          </Rule>
          <Rule>
            <strong>One extra top-level folder is tolerated.</strong> Both{' '}
            <Code>cd bundle && zip -r ../bundle.zip .</Code> and <Code>zip -r bundle.zip bundle/</Code> work.
          </Rule>
          <Rule>
            <strong>Other layouts are mapped, not rejected.</strong> The mapping step lists every folder in the
            zip; point one at frames, name the annotation-set folders, pick the manifest, and adjust the{' '}
            <Code>.ids.png</Code> / <Code>.masks.json</Code> suffixes if your files use different ones. Folders
            left as <em>Ignore</em> are not imported.
          </Rule>
          <Rule>
            <strong>Manifest selects and stratifies frames.</strong> <Code>manifest.csv</Code> needs a{' '}
            <Code>filename</Code> header column plus an optional <Code>stratum</Code> column;{' '}
            <Code>manifest.jsonl</Code> is one <Code>{'{"filename": "0001.jpg", "stratum": "night"}'}</Code> object
            per line. Bare basenames and full bundle paths both work.
          </Rule>
          <Rule>
            <strong>Re-uploading is additive.</strong> Paths already imported are skipped, so a second zip adds new
            frames or a new annotation set without duplicating anything. Imported images are never overwritten —
            ship corrected annotations under a <em>new</em> set name (<Code>llava_34b_v2</Code>) so answers already
            given still refer to what the labeller actually saw. Name and description stay editable via{' '}
            <strong>Edit</strong>; deleting is refused while a non-archived job uses the bundle.
          </Rule>
          <Rule>
            <strong>Everything else is reported, not fatal.</strong> Files outside <Code>frames/</Code>,{' '}
            <Code>annotations/&lt;set&gt;/</Code> and <Code>manifest.*</Code>, non-image frames, and unreadable images
            are
            listed as file errors; <Code>__MACOSX</Code> and <Code>.DS_Store</Code> junk is ignored silently. Files
            over 50 MB and zips over 100,000 entries are rejected.
          </Rule>
        </Box>
      </Stack>
    </AccordionDetails>
  </Accordion>
);

export default BundleFormatHelp;
