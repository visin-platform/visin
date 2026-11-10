import { useEffect, useRef, useState } from 'react';
import { ConfigProvider } from '../config/ConfigProvider';
import { CallScreen } from '../components/call/CallScreen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { useUserStream } from '../hooks/useUserStream';
import { preferredMicrophone } from '../services/audioDevices';
import { callApi, callsConfig } from '../services/callApi';
import { CallEngine, IDLE, type CallState } from '../services/callEngine';
import { canUseCamera, onCallRequest, setCallsReady } from '../services/callBus';
import { DEVICE_ID } from '../services/deviceId';
import { forgetDeviceOnServer, refreshSubscription, syncBadge } from '../services/pushNotifications';
import { playTone } from '../services/ringtone';
import { canCaptureScreen } from '../services/screenCapture';
import { logger } from '../utils/logger';

/** Sent by the shell as someone signs out; whoever must finish something first adds a promise to `tasks`. */
const LOGOUT_EVENT = 'visin:logout';

/**
 * What chat does for the whole app, whatever page is open: keeps this device's notification subscription current,
 * keeps the app icon's badge honest, and lets go of the device when the person signs out.
 */
export function BackgroundLayer() {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn) return;
    void refreshSubscription();
    void syncBadge();
    // Coming back to the app is when the number on its icon is most likely to be out of date.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncBadge();
    };
    const onLogout = (event: Event) => {
      (event as CustomEvent<{ tasks?: Promise<unknown>[] }>).detail?.tasks?.push(forgetDeviceOnServer());
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(LOGOUT_EVENT, onLogout);
    };
  }, [signedIn]);

  return null;
}

/** Rings, and plays the ringback while calling out. */
function useCallSounds(state: CallState): void {
  const tone = state.phase === 'incoming' ? 'ring' : state.phase === 'outgoing' ? 'ringback' : null;
  useEffect(() => {
    if (!tone) return;
    return playTone(tone);
  }, [tone]);
}

/** Keeps the screen on during a call, and takes the lock back after the app returns from the background. */
function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (released) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}

/**
 * Takes the "calling you" notification down once the call is answered, declined or over, on this device. A phone that
 * is locked keeps it until the server's "missed call" replaces it.
 */
function useCloseCallNotification(state: CallState): void {
  const ringingId = state.phase === 'incoming' ? state.call?.id : null;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (ringingId) {
      last.current = ringingId;
      return;
    }
    const callId = last.current;
    last.current = null;
    if (!callId || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.getNotifications({ tag: `call-${callId}` }))
      .then((notifications) => notifications?.forEach((notification) => notification.close()))
      .catch(() => undefined);
  }, [ringingId]);
}

/**
 * Calls, for the whole app: listens for a call ringing, places calls when a thread asks, and draws the call screen
 * over whatever page is open.
 *
 * Mounted once, above the pages, so going from a chat to a run does not hang up. Its event stream stays open with the
 * screen off while a call is on, since the call's signals and the server's "still there" check both ride on it.
 * Where the server has calls turned off, none of this starts, and no call button is offered.
 */
export function CallLayer() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<CallState>(IDLE);
  const engineRef = useRef<CallEngine | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void callsConfig()
      .then((config) => alive && setEnabled(config.enabled))
      .catch((error: Error) => logger.warn('Could not check whether calls are on', { error: error.message }));
    return () => {
      alive = false;
      setEnabled(false);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !enabled) return;
    const engine = new CallEngine({
      api: callApi,
      deviceId: DEVICE_ID,
      userId: user.id,
      onChange: setState,
      preferredMicrophone
    });
    engineRef.current = engine;
    setCallsReady(true);
    void engine.resume();

    const stopListening = onCallRequest(({ conversationId, peer, camera }) => void engine.start(conversationId, peer, { camera }));
    // Opened from a "calling you" notification, the page may have been alive in the background all along, with the
    // ringing event long gone.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void engine.resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Closing the tab mid-call hangs up instead of leaving the other side on until the server notices. Not
    // `dispose`: the page may only be going into the back-forward cache and come back, and must still ring then.
    const onLeave = () => engine.leave();
    window.addEventListener('pagehide', onLeave);

    return () => {
      stopListening();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
      engine.dispose();
      engineRef.current = null;
      setCallsReady(false);
      setState(IDLE);
    };
  }, [user?.id, enabled]);

  const inCall = state.phase !== 'idle' && state.phase !== 'ended';

  // Shrunk to a bar so the app stays usable while talking. Every new call starts on the full screen.
  const [minimized, setMinimized] = useState(false);
  const callId = state.call?.id ?? null;
  useEffect(() => {
    if (!inCall) setMinimized(false);
  }, [inCall, callId]);

  // Showing a screen: the call steps aside to a bar so what is shown is in view. Theirs coming in: it comes forward.
  useEffect(() => {
    if (state.sharingScreen) setMinimized(true);
  }, [state.sharingScreen]);
  useEffect(() => {
    // Not while showing one's own: the call stepped aside on purpose, so the page being shown stays in view. Once
    // that ends with theirs still on, theirs is what there is to look at.
    if (state.remoteSharing && !state.sharingScreen) setMinimized(false);
  }, [state.remoteSharing, state.sharingScreen]);

  // How much of the other person's pictures this device shows, so their side sends no more than that: the call
  // screen, the bar's small circle, or nothing at all with the page hidden or the phone locked.
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const showing = !pageVisible ? 'none' : minimized ? 'small' : 'full';
  useEffect(() => {
    if (state.phase === 'active') engineRef.current?.setShowing(showing);
  }, [showing, state.phase]);

  useUserStream({
    enabled: enabled && Boolean(user?.id),
    // Lets the server tell whether this tab, the one on the call, is still here.
    deviceId: DEVICE_ID,
    onEvent: (event) => engineRef.current?.handleEvent(event),
    onOpen: () => void engineRef.current?.resume()
  });

  useCallSounds(state);
  // Also while calling out: a screen that dims during the ringing pauses the page, and the other person's answer
  // waits there until it is touched.
  useWakeLock(state.phase === 'outgoing' || state.phase === 'connecting' || state.phase === 'active');
  useCloseCallNotification(state);

  if (!enabled) return null;
  const engine = () => engineRef.current;
  return (
    <CallScreen
      state={state}
      onAccept={() => void engine()?.accept()}
      onDecline={() => engine()?.decline()}
      onHangUp={() => engine()?.hangUp()}
      onToggleMute={() => engine()?.toggleMute()}
      onSelectMicrophone={(deviceId) => void engine()?.switchMicrophone(deviceId)}
      // A phone's browser cannot capture a screen, but can still watch one.
      onToggleScreen={canCaptureScreen() ? () => void engine()?.toggleScreen() : undefined}
      onToggleCamera={canUseCamera() ? () => void engine()?.toggleCamera() : undefined}
      onFlipCamera={() => void engine()?.flipCamera()}
      onDismiss={() => engine()?.dismiss()}
      minimized={minimized}
      onMinimize={() => setMinimized(true)}
      onExpand={() => setMinimized(false)}
    />
  );
}

/** As the shell mounts it: with chat's own config and sign-in check, read from chat's origin. */
export default function CallHost() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <BackgroundLayer />
        <CallLayer />
      </AuthProvider>
    </ConfigProvider>
  );
}
