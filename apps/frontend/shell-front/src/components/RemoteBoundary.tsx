import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button } from '@mui/material';

interface RemoteBoundaryProps {
  appTitle: string;
  onRetry: () => void;
  children: ReactNode;
}

interface RemoteBoundaryState {
  error: Error | null;
}

/**
 * Keeps one app's failure inside the content area. Each app is its own
 * deployment, so one being down or mid-deploy is an expected state rather than
 * a bug — the menu, and every other app, has to keep working through it.
 */
export class RemoteBoundary extends Component<RemoteBoundaryProps, RemoteBoundaryState> {
  state: RemoteBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RemoteBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.appTitle} failed to render`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={this.props.onRetry}>
            Retry
          </Button>
        }
      >
        {this.props.appTitle} is unavailable right now. {error.message}
      </Alert>
    );
  }
}
