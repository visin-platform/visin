import { Box } from '@mui/material';
import { INK } from '../theme';

const SIDEBAR_ITEMS = [64, 48, 56, 40];
const TILES = [
  { label: 'Runs', value: '24' },
  { label: 'Datasets', value: '7' },
  { label: 'Labelled', value: '18k' }
];

/**
 * A stylised abstraction of the app shell — dark sidebar, metric tiles, an
 * epoch chart — not a screenshot of real data. It replaces the stock photos the
 * old page pulled from a third-party CDN: it needs no network request, scales
 * cleanly, and uses the product's own palette so the page looks like the thing
 * it is selling. Decorative, so it is hidden from assistive tech.
 */
export default function ProductVisual() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: 'flex',
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: '#fff',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.55)',
        minHeight: { xs: 240, sm: 320 }
      }}
    >
      {/* Sidebar, mirroring the real app's navigation rail */}
      <Box
        sx={{
          width: { xs: 56, sm: 88 },
          bgcolor: INK,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          flexShrink: 0
        }}
      >
        <Box sx={{ width: 20, height: 20, borderRadius: '6px', bgcolor: 'primary.main', mb: 1 }} />
        {SIDEBAR_ITEMS.map((width, index) => (
          <Box
            key={width}
            sx={{
              height: 8,
              width: `${width}%`,
              borderRadius: 4,
              bgcolor: index === 1 ? 'primary.light' : 'rgba(255,255,255,0.18)'
            }}
          />
        ))}
      </Box>

      <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 }, bgcolor: '#f8fafc', minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
          {TILES.map((tile) => (
            <Box
              key={tile.label}
              sx={{
                flex: 1,
                p: { xs: 1, sm: 1.5 },
                borderRadius: 2,
                bgcolor: '#fff',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Box sx={{ fontSize: { xs: 16, sm: 20 }, fontWeight: 700, color: 'text.primary' }}>{tile.value}</Box>
              <Box sx={{ fontSize: 11, color: 'text.secondary' }}>{tile.label}</Box>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            borderRadius: 2,
            bgcolor: '#fff',
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box
            component="svg"
            viewBox="0 0 320 110"
            preserveAspectRatio="none"
            sx={{ width: '100%', height: { xs: 90, sm: 130 }, display: 'block' }}
          >
            {[0, 1, 2, 3].map((row) => (
              <line key={row} x1="0" y1={row * 30 + 10} x2="320" y2={row * 30 + 10} stroke="#e2e8f0" strokeWidth="1" />
            ))}
            <polyline
              points="0,96 40,84 80,70 120,58 160,44 200,36 240,28 280,22 320,18"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="0,100 40,94 80,86 120,80 160,70 200,66 240,58 280,54 320,50"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
