import { expect, test } from '@playwright/test';

/**
 * Two real call engines, each with a real RTCPeerConnection and Chromium's synthetic microphone and camera, joined by
 * an in-memory stand-in for chat-service. Nothing is faked on the media side: what this proves is that the offer, the
 * answer, the ICE candidates and the two video lines the engine sets up really connect, and that a camera and a shared
 * screen really arrive as moving pictures on the other side. (The engine's unit tests use a fake peer; this is the
 * one place the browser's own WebRTC is exercised.)
 */
/** The parts of the engine this test touches. It is loaded by the browser from the dev server, so Node cannot type it. */
interface State {
  phase: string;
  message: string | null;
  remoteStream: MediaStream | null;
  remoteCamera: boolean;
  remoteCameraStream: MediaStream | null;
  remoteSharing: boolean;
  sharingScreen: boolean;
  remoteScreen: MediaStream | null;
}
interface Engine {
  start(conversationId: string, peer: unknown): Promise<void>;
  accept(): Promise<void>;
  toggleCamera(): Promise<void>;
  toggleScreen(): Promise<void>;
  hangUp(): void;
  handleEvent(event: unknown): void;
}

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      // Two peers in one page have no network to meet on; loopback lets their host candidates find each other.
      '--allow-loopback-in-peer-connection'
    ]
  }
});

test('two browsers connect, and a camera and a shared screen arrive as live video', async ({ page }) => {
  test.setTimeout(60_000);
  // The app's own page, so the dev server has found and bundled its dependencies (MUI among them, which the engine's
  // module reaches) before the engine is loaded by hand. From a bare page, parallel workers race that bundling.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const outcome = await page.evaluate(async () => {
    // Through a variable, so neither TypeScript nor the bundler tries to resolve a path only the dev server serves.
    const module = '/src/services/callEngine.ts';
    const { CallEngine } = (await import(/* @vite-ignore */ module)) as { CallEngine: new (options: unknown) => Engine };

    const ANN = { userId: 'ann', name: 'Ann', picture: null };
    const BO = { userId: 'bo', name: 'Bo', picture: null };
    const call = {
      id: 'call-1',
      conversationId: 'c1',
      caller: ANN,
      callees: [BO],
      callerDeviceId: 'dev-ann',
      answeredBy: null as string | null,
      answeredDeviceId: null as string | null,
      status: 'ringing' as 'ringing' | 'active' | 'ended',
      endReason: null as string | null,
      startedAt: new Date().toISOString(),
      answeredAt: null as string | null,
      endedAt: null as string | null
    };
    const states: Record<string, State | undefined> = {};
    const engines: Record<string, Engine> = {};
    const tell = (to: string, type: string, payload: unknown) =>
      queueMicrotask(() => engines[to]!.handleEvent({ type, conversationId: 'c1', at: Date.now(), payload }));

    /** chat-service, in memory: the same answers it gives, delivered straight to the other engine. */
    const api = (me: 'ann' | 'bo') => {
      const other = me === 'ann' ? 'bo' : 'ann';
      return {
        iceServers: async () => ({ iceServers: [], relay: true, mode: 'local' as const, expiresAt: null }),
        currentCall: async () => null,
        startCall: async () => {
          tell('bo', 'call.ringing', { ...call });
          return { ...call };
        },
        acceptCall: async (_id: string, deviceId: string) => {
          Object.assign(call, { status: 'active', answeredBy: 'bo', answeredDeviceId: deviceId, answeredAt: new Date().toISOString() });
          tell('ann', 'call.accepted', { ...call });
          return { ...call };
        },
        declineCall: async () => undefined,
        endCall: async () => {
          if (call.status === 'ended') return;
          Object.assign(call, { status: 'ended', endReason: 'hangup', endedAt: new Date().toISOString() });
          tell('ann', 'call.ended', { ...call });
          tell('bo', 'call.ended', { ...call });
        },
        sendSignal: async (_id: string, deviceId: string, data: unknown) =>
          tell(other, 'call.signal', {
            callId: 'call-1',
            fromDeviceId: deviceId,
            toDeviceId: other === 'ann' ? 'dev-ann' : 'dev-bo',
            data
          })
      };
    };

    /** A moving picture standing in for a shared screen: the real picker needs a person to choose. */
    const screen = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      let frame = 0;
      setInterval(() => {
        context.fillStyle = frame % 2 ? '#123456' : '#654321';
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = '#ffffff';
        context.fillText(`frame ${frame++}`, 20, 40);
      }, 50);
      return canvas.captureStream(15);
    };

    for (const [who, device, peer] of [['ann', 'dev-ann', BO], ['bo', 'dev-bo', ANN]] as const) {
      engines[who] = new CallEngine({
        api: api(who),
        userId: who,
        deviceId: device,
        onChange: (state: State) => (states[who] = state),
        getScreen: async () => screen()
      });
      void peer;
    }

    const until = async (what: string, test: () => boolean, ms = 20_000) => {
      const deadline = Date.now() + ms;
      while (!test()) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}. ann=${states.ann?.phase} bo=${states.bo?.phase}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    /** Whether a stream is showing moving pictures: it has a size, and its frame counter moves. */
    const playing = async (stream: MediaStream | null | undefined) => {
      if (!stream) return false;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      document.body.append(video);
      await video.play().catch(() => undefined);
      await until('video size', () => video.videoWidth > 0);
      const first = (video as HTMLVideoElement & { getVideoPlaybackQuality(): { totalVideoFrames: number } }).getVideoPlaybackQuality().totalVideoFrames;
      await new Promise((resolve) => setTimeout(resolve, 600));
      const later = (video as HTMLVideoElement & { getVideoPlaybackQuality(): { totalVideoFrames: number } }).getVideoPlaybackQuality().totalVideoFrames;
      video.remove();
      return later > first;
    };

    // Ann calls Bo, who answers.
    await engines.ann!.start('c1', BO);
    await until('Bo to be rung', () => states.bo?.phase === 'incoming');
    await engines.bo!.accept();
    await until('both to be connected', () => states.ann?.phase === 'active' && states.bo?.phase === 'active');
    const heardBo = Boolean(states.ann?.remoteStream?.getAudioTracks().length);
    const heardAnn = Boolean(states.bo?.remoteStream?.getAudioTracks().length);

    // Ann turns her camera on: Bo sees her moving.
    await engines.ann!.toggleCamera();
    await until('Bo to see Ann’s camera', () => Boolean(states.bo?.remoteCamera && states.bo.remoteCameraStream));
    const cameraMoves = await playing(states.bo?.remoteCameraStream);

    // Bo shows his screen: Ann sees it moving, alongside the camera that is still on.
    await engines.bo!.toggleScreen();
    await until('Ann to see Bo’s screen', () => Boolean(states.ann?.remoteSharing && states.ann.remoteScreen));
    const screenMoves = await playing(states.ann?.remoteScreen);
    const cameraStillOn = Boolean(states.bo?.remoteCamera);

    // Stopping a screen share is signaled to the other browser and releases local capture.
    await engines.bo!.toggleScreen();
    await until('Ann to be told sharing stopped', () => states.ann?.remoteSharing === false && !states.bo?.sharingScreen);
    const sharingStopped = !states.bo?.sharingScreen && !states.ann?.remoteSharing;

    // Ann stops her camera; Bo is told.
    await engines.ann!.toggleCamera();
    await until('Bo to be told the camera stopped', () => states.bo?.remoteCamera === false);

    engines.ann!.hangUp();
    await until('both to be over', () => states.ann?.phase === 'ended' && states.bo?.phase === 'ended');
    return { heardBo, heardAnn, cameraMoves, screenMoves, cameraStillOn, sharingStopped, endedAnn: states.ann?.message, endedBo: states.bo?.message };
  });

  expect(outcome).toEqual({
    heardBo: true,
    heardAnn: true,
    cameraMoves: true,
    screenMoves: true,
    cameraStillOn: true,
    sharingStopped: true,
    endedAnn: 'Call ended',
    endedBo: 'Call ended'
  });
});
