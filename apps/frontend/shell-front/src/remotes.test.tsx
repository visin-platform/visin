import { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@module-federation/runtime', () => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}));
vi.mock('./config/ConfigProvider', () => ({
  getGlobalConfig: vi.fn(),
}));

import { loadRemote, registerRemotes } from '@module-federation/runtime';
import { getGlobalConfig } from './config/ConfigProvider';
import { RemoteBoundary } from './components/RemoteBoundary';

const mockedLoad = vi.mocked(loadRemote);
const mockedRegister = vi.mocked(registerRemotes);
const mockedConfig = vi.mocked(getGlobalConfig);

// remotes.ts keeps module-level state (registration, one lazy per app), so each
// test gets a fresh copy of it.
const freshRemotes = async () => {
  vi.resetModules();
  return import('./remotes');
};

const renderRemote = (Remote: React.ComponentType) =>
  render(
    <RemoteBoundary appTitle="Vision" onRetry={vi.fn()}>
      <Suspense fallback={<div>loading</div>}>
        <Remote />
      </Suspense>
    </RemoteBoundary>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockedConfig.mockReturnValue({
    VISION_FRONT_URL: 'https://vision.test/',
    LABEL_FRONT_URL: 'https://label.test',
  });
  mockedLoad.mockResolvedValue({ default: () => <div>vision pages</div> });
});

describe('remoteComponent', () => {
  it('loads the app exposed module and renders it', async () => {
    const { remoteComponent } = await freshRemotes();

    renderRemote(remoteComponent('vision'));

    expect(await screen.findByText('vision pages')).toBeInTheDocument();
    expect(mockedLoad).toHaveBeenCalledWith('vision/App');
  });

  it('registers every configured app once, from config, and skips the unconfigured', async () => {
    const { remoteComponent } = await freshRemotes();

    renderRemote(remoteComponent('vision'));
    await screen.findByText('vision pages');
    renderRemote(remoteComponent('label'));
    await screen.findAllByText('vision pages');

    expect(mockedRegister).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith([
      { name: 'vision', entry: 'https://vision.test/remoteEntry.js', type: 'module' },
      { name: 'label', entry: 'https://label.test/remoteEntry.js', type: 'module' },
    ]);
  });

  // React keeps a loaded lazy component's module, so coming back to an app
  // renders it without waiting again — the point of the shell.
  it('hands back the same component for an app until it is forgotten', async () => {
    const { remoteComponent, forgetRemote } = await freshRemotes();

    const first = remoteComponent('vision');
    expect(remoteComponent('vision')).toBe(first);
    forgetRemote('vision');
    expect(remoteComponent('vision')).not.toBe(first);
  });

  it('says which setting is missing for an app with no URL configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { remoteComponent } = await freshRemotes();

    renderRemote(remoteComponent('account'));

    expect(await screen.findByText(/ACCOUNT_FRONT_URL is not configured/)).toBeInTheDocument();
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  // An app mid-deploy or down is expected; the page names what it could not
  // reach and leaves the federation runtime's diagnostics to the console.
  it('names the address it could not reach when the remote entry fails to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedLoad.mockRejectedValue(new Error('[ Federation Runtime ]: Failed to load script resources. #RUNTIME-008'));
    const { remoteComponent } = await freshRemotes();

    renderRemote(remoteComponent('label'));

    expect(await screen.findByText(/Could not reach Labeling at https:\/\/label\.test\./)).toBeInTheDocument();
    expect(screen.queryByText(/RUNTIME-008/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Loading Labeling failed', expect.any(Error));
  });

  it('fails visibly when a remote provides nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedLoad.mockResolvedValue(null);
    const { remoteComponent } = await freshRemotes();

    renderRemote(remoteComponent('vision'));

    expect(await screen.findByText(/Vision did not provide its pages/)).toBeInTheDocument();
  });
});

describe('VisionUploads', () => {
  const freshUploads = async () => {
    vi.resetModules();
    const remotes = await import('./remotes');
    const { default: VisionUploads } = await import('./components/VisionUploads');
    return { ...remotes, VisionUploads };
  };

  it('stays away until Vision has loaded, then shows Vision’s upload corner on any page', async () => {
    mockedLoad.mockImplementation(async (id: string) => ({
      default: () => <div>{id === 'vision/Uploads' ? 'upload corner' : 'vision pages'}</div>,
    }));
    const { VisionUploads, remoteComponent } = await freshUploads();

    const { rerender } = render(<VisionUploads />);
    expect(screen.queryByText('upload corner')).not.toBeInTheDocument();
    expect(mockedLoad).not.toHaveBeenCalledWith('vision/Uploads');

    renderRemote(remoteComponent('vision'));
    await screen.findByText('vision pages');
    rerender(<VisionUploads />);
    expect(await screen.findByText('upload corner')).toBeInTheDocument();
    expect(mockedLoad).toHaveBeenCalledWith('vision/Uploads');
  });

  it('renders nothing, and keeps the page, when the corner cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedLoad.mockImplementation(async (id: string) => (id === 'vision/Uploads' ? null : { default: () => <div>vision pages</div> }));
    const { VisionUploads, remoteComponent } = await freshUploads();

    renderRemote(remoteComponent('vision'));
    await screen.findByText('vision pages');
    const { container } = render(<VisionUploads />);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('Vision upload panel failed to load', expect.any(Error)));
    expect(container).toBeEmptyDOMElement();
  });
});
