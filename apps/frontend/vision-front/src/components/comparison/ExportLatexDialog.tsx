import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';

interface ExportLatexDialogProps {
  open: boolean;
  onClose: () => void;
  activeTab: number;
  onTabChange: (tab: number) => void;
  trainingLatex: string;
  testingLatex: string;
  benchmarkingLatex: string;
  allLatex: string;
  copied: boolean;
  onCopyAll: () => void;
}

const ExportLatexDialog: React.FC<ExportLatexDialogProps> = ({
  open,
  onClose,
  activeTab,
  onTabChange,
  trainingLatex,
  testingLatex,
  benchmarkingLatex,
  allLatex,
  copied,
  onCopyAll
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogTitle>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Export All LaTeX</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={onCopyAll}
            disabled={!allLatex}
          >
            {copied ? 'Copied!' : 'Copy All Tabs'}
          </Button>
          <Button size="small" onClick={onClose}>Close</Button>
        </Box>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ p: 0 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => onTabChange(v)}>
          <Tab label="Training" />
          <Tab label="Testing" />
          <Tab label="Benchmarking" />
        </Tabs>
      </Box>

      {[trainingLatex, testingLatex, benchmarkingLatex].map((latexCode, idx) => (
        <Box
          key={idx}
          role="tabpanel"
          hidden={activeTab !== idx}
          sx={{ p: 3 }}
        >
          {activeTab === idx && (
            latexCode ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: '#f5f5f5',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '60vh',
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: 'divider'
                }}
              >
                {latexCode}
              </Paper>
            ) : (
              <Alert severity="info">
                No data available for this section.
              </Alert>
            )
          )}
        </Box>
      ))}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

export default ExportLatexDialog;
