# Vision Front - ML Training Dashboard

Frontend application for managing ML training datasets, configurations, and visualizing epoch metrics.

## Features

- 📊 **Dataset Management**: Browse and manage training datasets
- 🎯 **Training Runs**: View and monitor training configurations
- 📈 **Metrics Visualization**: Interactive charts for epoch metrics (loss, IoU, learning rate, etc.)
- 🎨 **Modern UI**: Clean, gray/white/black aesthetic with Material-UI

## Configuration

### Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update environment variables as needed:
   ```env
   VITE_VISION_API_URL=http://localhost:4010
   VITE_AUTH_SERVICE_URL=http://localhost:4001
   VITE_AUTH_FRONT_URL=http://localhost:3001
   VITE_PUBLIC_API_URL=http://localhost:4009
   VITE_SHELL_FRONT_URL=http://localhost:3000
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3012`

### Production

In production, the app loads configuration from `public/config.json`. This file should be generated during deployment with actual service URLs:

```json
{
  "VISION_API_URL": "https://vision-api.example.com",
  "AUTH_SERVICE_URL": "https://auth.example.com",
  "AUTH_FRONT_URL": "https://auth.example.com",
  "PUBLIC_API_URL": "https://api.example.com",
  "SHELL_FRONT_URL": "https://app.example.com"
}
```

## API Backend

This frontend connects to the Vision Service backend API running on port 4010.

Ensure the backend is running:
```bash
cd ../backend/vision-service
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (port 3012)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── components/       # Reusable UI components
│   └── AppLayout.tsx
├── config/          # Configuration and API setup
│   ├── ConfigProvider.tsx
│   └── visionApi.ts
├── hooks/           # Custom React hooks
│   └── useConfig.ts
├── pages/           # Page components
│   ├── DatasetsPage.tsx
│   ├── TrainingsPage.tsx
│   └── TrainingDetailPage.tsx
├── routes/          # Route definitions
│   └── index.tsx
├── services/        # API service layer
│   ├── datasetService.ts
│   ├── trainingService.ts
│   └── epochService.ts
├── types/           # TypeScript type definitions
│   └── index.ts
├── App.tsx          # Root component
└── main.tsx         # Application entry point
```

## Technologies

- **React 19** - UI framework
- **TypeScript 5** - Type safety
- **Material-UI 7** - Component library
- **MUI X Charts** - Data visualization
- **TanStack React Query** - Server state management
- **React Router 7** - Navigation
- **Vite 7** - Build tool

## Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t vision-front .

# Run container
docker run -p 3012:80 vision-front
```

Or use Docker Compose:

```bash
docker-compose up
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_VISION_API_URL` | Vision Service API endpoint | `http://localhost:4010` |
| `VITE_AUTH_SERVICE_URL` | Authentication service URL | - |
| `VITE_AUTH_FRONT_URL` | Auth frontend URL | - |
| `VITE_PUBLIC_API_URL` | Public API for logging | - |
| `VITE_SHELL_FRONT_URL` | Shell frontend URL | - |

## License

MIT
