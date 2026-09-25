import { Component, Suspense, type ReactNode } from 'react';
import { remoteUploads, useRemoteLoaded } from '../remotes';

/** A missing upload corner costs nothing but the corner: never the page. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.error('Vision upload panel failed to load', error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Zip uploads in the corner of every shell page, once Vision has been opened —
 * an upload keeps running on the home page and in Labeling, so its progress
 * belongs there too. Vision renders nothing of its own inside the shell.
 */
export default function VisionUploads() {
  const visionLoaded = useRemoteLoaded('vision');
  if (!visionLoaded) return null;
  const Uploads = remoteUploads();
  return (
    <Quiet>
      <Suspense fallback={null}>
        <Uploads />
      </Suspense>
    </Quiet>
  );
}
