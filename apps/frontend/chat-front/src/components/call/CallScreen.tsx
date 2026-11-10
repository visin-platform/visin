import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { ReactNode } from 'react';
import { livePalette, onImage, tint } from '@visin/frontend-core';
import { logger } from '../../utils/logger';
import type { CallState } from '../../services/callEngine';
import { preferredSpeaker, rememberMicrophone, rememberSpeaker } from '../../services/audioDevices';
import { AudioSettings } from './AudioSettings';
import { cameraFit, formatElapsed, statusText } from './callFormat';
import { useDraggable } from './useDraggable';

export interface CallScreenProps {
  state: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onDismiss: () => void;
  /** Shrunk to a bar, so the rest of Visin can be used while talking. */
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
  /**
   * Moves the call to another microphone. Giving it is what puts the audio
   * settings on the screen: the choice is remembered here, the call is moved
   * by the caller.
   */
  onSelectMicrophone?: (deviceId: string | null) => void;
  /**
   * Starts or stops showing this device's screen to the other person. Absent where the browser
   * cannot capture one (a phone), which can still watch theirs.
   */
  onToggleScreen?: () => void;
  /** Turns this device's camera on or off. Absent where the browser has no camera to offer. */
  onToggleCamera?: () => void;
  /** Turns the camera to the phone's other one. Offered only while the camera is open and there is another. */
  onFlipCamera?: () => void;
}

/** Who the other person is, as a picture or their first letter. */
function PersonAvatar({ name, picture, size }: { name: string; picture: string | null; size: number }) {
  return (
    <Avatar src={picture ?? undefined} alt="" sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: onImage.chip, color: onImage.ink }}>
      {name.trim().charAt(0).toUpperCase()}
    </Avatar>
  );
}

/** Ticks once a second while a call is connected. */
function useElapsed(since: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : formatElapsed(now - since);
}

function RoundButton({
  label,
  color,
  onClick,
  children
}: {
  label: string;
  color: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <ButtonBase
        aria-label={label}
        onClick={onClick}
        sx={{
          width: 68,
          height: 68,
          borderRadius: '50%',
          bgcolor: color,
          color: onImage.ink,
          boxShadow: `0 6px 20px ${onImage.scrim}`,
          '& svg': { fontSize: 30 }
        }}
      >
        {children}
      </ButtonBase>
      <Typography variant="caption" sx={{ color: SOFT_INK }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Palette paths for the two buttons that mean something by their colour, and the frosted look of the rest. */
const RED = 'error.main';
const GREEN = 'success.main';
const GLASS = onImage.chip;
/** Text over the call's dark background, a little softer than the name. */
const SOFT_INK = tint(onImage.ink, 0.8);
/** A button that is switched on is solid light with a dark icon. */
const ON = { bgcolor: onImage.ink, color: onImage.backdrop, '&:hover': { bgcolor: onImage.ink } } as const;
/** The call's own background, the same in both colour schemes: a dark stage with a wash of the brand colour. */
const stageBackground = {
  bgcolor: onImage.backdrop,
  backgroundImage: (theme: Parameters<typeof livePalette>[0]) =>
    `linear-gradient(165deg, ${tint(livePalette(theme).primary.main, 0.45)} 0%, transparent 75%)`
} as const;

/** Where the bar was last dragged to, on this device. */
const BAR_POSITION_KEY = 'visin-call-bar-position';

/**
 * The call as a small bar at the bottom of the screen, clear of the chat
 * composer and the phone's tab bar, so a call can run while the rest of the
 * app is used. Tapping the name brings the full screen back. It can be dragged
 * out of the way, say off a collage being arranged, and stays where it is left.
 */
function CallBar({
  state,
  elapsed,
  onHangUp,
  onToggleMute,
  onToggleScreen,
  onToggleCamera,
  onExpand
}: {
  state: CallState;
  elapsed: string | null;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleScreen?: () => void;
  onToggleCamera?: () => void;
  onExpand?: () => void;
}) {
  const name = state.peer?.name || 'Call';
  const talking = state.phase === 'connecting' || state.phase === 'active';
  const { ref, position, handlers } = useDraggable<HTMLDivElement>(BAR_POSITION_KEY);
  return (
    <Box
      ref={ref}
      role="region"
      aria-label={`Call with ${name}`}
      {...handlers}
      sx={{
        position: 'fixed',
        zIndex: 1600,
        ...(position
          ? { left: position.left, top: position.top }
          : {
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: { xs: 'calc(env(safe-area-inset-bottom) + 88px)', sm: 24 }
            }),
        width: 'min(360px, calc(100vw - 32px))',
        // A finger drag moves the bar instead of scrolling the page under it.
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 0.25,
        pr: 0.75,
        py: 0.75,
        borderRadius: 999,
        ...stageBackground,
        color: onImage.ink,
        boxShadow: `0 10px 30px ${onImage.scrim}`
      }}
    >
      <DragIndicatorIcon aria-hidden fontSize="small" sx={{ color: tint(onImage.ink, 0.45), mr: -0.5 }} />
      <ButtonBase
        onClick={onExpand}
        aria-label="Open call"
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          justifyContent: 'flex-start',
          borderRadius: 999
        }}
      >
        {/* Their camera, as the picture of who they are, while it is on: the bar's only room for one. */}
        {state.remoteCamera && state.remoteCameraStream ? (
          <Box sx={{ width: 36, height: 36, flexShrink: 0 }}>
            <LiveVideo stream={state.remoteCameraStream} label={`${name}’s camera`} sx={{ borderRadius: '50%' }} />
          </Box>
        ) : (
          <PersonAvatar name={name} picture={state.peer?.picture ?? null} size={36} />
        )}
        <Box sx={{ minWidth: 0, textAlign: 'left' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.25 }}>
            {name}
          </Typography>
          <Typography
            variant="caption"
            noWrap
            component="p"
            sx={{ color: SOFT_INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}
          >
            {statusText(state, elapsed)}
          </Typography>
        </Box>
      </ButtonBase>
      {talking && (
        <IconButton
          aria-label={state.muted ? 'Unmute' : 'Mute'}
          onClick={onToggleMute}
          sx={state.muted ? ON : { color: onImage.ink, bgcolor: GLASS, '&:hover': { bgcolor: GLASS } }}
        >
          {state.muted ? <MicOffIcon /> : <MicIcon />}
        </IconButton>
      )}
      {/* Your camera being on is shown, and can be turned off, from the bar: it is the one thing a call can be
        showing that you would not see with the call stepped aside. */}
      {state.cameraOn && onToggleCamera && (
        <IconButton aria-label="Camera off" onClick={onToggleCamera} sx={ON}>
          <VideocamIcon />
        </IconButton>
      )}
      {/* Stopping is here, where the call has stepped aside to; starting is on the full screen. */}
      {state.sharingScreen && onToggleScreen && (
        <IconButton aria-label="Stop sharing" onClick={onToggleScreen} sx={ON}>
          <StopScreenShareIcon />
        </IconButton>
      )}
      <IconButton aria-label="End" onClick={onHangUp} sx={{ color: onImage.ink, bgcolor: RED, '&:hover': { bgcolor: RED } }}>
        <CallEndIcon />
      </IconButton>
    </Box>
  );
}

/** `cameraFit` for one video element, kept current as the picture turns (a phone rotated) or the window does. */
function useCameraFit(ref: RefObject<HTMLVideoElement | null>, enabled: boolean): 'cover' | 'contain' {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const update = () =>
      setFit(
        cameraFit(
          { width: element.videoWidth, height: element.videoHeight },
          { width: element.clientWidth, height: element.clientHeight }
        )
      );
    update();
    element.addEventListener('loadedmetadata', update);
    element.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('loadedmetadata', update);
      element.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [ref, enabled]);
  return fit;
}

/**
 * One video of the call: a stream drawn muted (the voice is the audio element's) and kept playing.
 * A person's own camera is mirrored, as a mirror would show them; a shared screen is not, or its text reads backwards.
 */
function LiveVideo({
  stream,
  label,
  mirror = false,
  fit = 'cover',
  sx
}: {
  stream: MediaStream | null;
  label: string;
  mirror?: boolean;
  /** `camera` fills the box when the picture is the same way round as it, and shows it whole otherwise. */
  fit?: 'cover' | 'contain' | 'camera';
  sx?: object;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const cameraFill = useCameraFit(ref, fit === 'camera');
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);
  return (
    <Box
      component="video"
      ref={ref}
      aria-label={label}
      autoPlay
      muted
      playsInline
      sx={{
        width: '100%',
        height: '100%',
        objectFit: fit === 'camera' ? cameraFill : fit,
        borderRadius: 1.5,
        bgcolor: onImage.backdrop,
        ...(mirror ? { transform: 'scaleX(-1)' } : null),
        ...sx
      }}
    />
  );
}

/**
 * The whole screen during a call, over whatever page is open.
 *
 * Also where the other person's audio plays: an `<audio>` element is the one
 * thing every browser, iOS included, reliably plays a WebRTC stream through.
 */
export function CallScreen({
  state,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onDismiss,
  minimized = false,
  onMinimize,
  onExpand,
  onSelectMicrophone,
  onToggleScreen,
  onToggleCamera,
  onFlipCamera
}: CallScreenProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioOpen, setAudioOpen] = useState(false);
  const [speakerId, setSpeakerId] = useState<string | null>(preferredSpeaker);
  // The element only exists while there is a call.
  const live = state.phase !== 'idle';
  const elapsed = useElapsed(state.phase === 'active' ? state.connectedAt : null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.srcObject = state.remoteStream;
    if (state.remoteStream) void element.play().catch(() => undefined);
  }, [state.remoteStream]);

  // What is drawn on the full screen only: the bar has no room for pictures, and the sound goes on either way.
  // The stage is the biggest thing on show: their screen, else their camera, else only who they are.
  const full = state.phase === 'active' && !minimized;
  const theirScreen = full && state.remoteSharing ? state.remoteScreen : null;
  const theirCamera = full && state.remoteCamera ? state.remoteCameraStream : null;
  const ownCamera = full && state.cameraOn ? state.localCamera : null;
  const viewing = theirScreen !== null || theirCamera !== null;

  // Tapping their picture clears the name and buttons off it, and tapping again brings them back.
  // Nothing to hide them from without a picture, so they come back when it goes.
  const [controlsHidden, setControlsHidden] = useState(false);
  useEffect(() => {
    if (!viewing) setControlsHidden(false);
  }, [viewing]);
  const overStage = {
    position: 'relative',
    zIndex: 1,
    ...(viewing
      ? {
          transition: 'opacity 200ms',
          opacity: controlsHidden ? 0 : 1,
          pointerEvents: controlsHidden ? 'none' : 'auto',
          // Reached by keyboard while hidden, it shows again rather than being pressed unseen.
          '&:focus-within': { opacity: 1 }
        }
      : null)
  } as const;

  // A panel left open by a call that ended must not be open on the next one.
  useEffect(() => {
    if (!live || state.phase === 'ended') setAudioOpen(false);
  }, [live, state.phase]);

  // The output is an element property, so it is set once the element exists
  // and again whenever a different one is chosen. Not every browser has it.
  // Left alone until a speaker has been chosen: the default is not ours to set.
  const chosenSpeaker = useRef(false);
  useEffect(() => {
    const element = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!live || !element?.setSinkId) return;
    if (speakerId === null && !chosenSpeaker.current) return;
    if (speakerId !== null) chosenSpeaker.current = true;
    element.setSinkId(speakerId ?? '').catch((error: Error) => logger.warn('Could not set the speaker', { error: error.message }));
  }, [speakerId, live]);

  if (state.phase === 'idle') return null;

  const name = state.peer?.name || 'Call';
  const talking = state.phase === 'connecting' || state.phase === 'active';
  // A ringing call or an ending one always gets the whole screen.
  const asBar = minimized && (talking || state.phase === 'outgoing');

  // The audio element comes first and in the same place either way, so
  // switching between the bar and the full screen never interrupts the sound.
  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {onSelectMicrophone && (
        <AudioSettings
          open={audioOpen}
          onClose={() => setAudioOpen(false)}
          microphoneId={state.micDeviceId}
          onSelectMicrophone={(deviceId) => {
            rememberMicrophone(deviceId);
            onSelectMicrophone(deviceId);
          }}
          speakerId={speakerId}
          onSelectSpeaker={(deviceId) => {
            rememberSpeaker(deviceId);
            setSpeakerId(deviceId);
          }}
        />
      )}
      {asBar ? (
        <CallBar
          state={state}
          elapsed={elapsed}
          onHangUp={onHangUp}
          onToggleMute={onToggleMute}
          onToggleScreen={onToggleScreen}
          onToggleCamera={onToggleCamera}
          onExpand={onExpand}
        />
      ) : (
        <Box
          role="dialog"
          aria-label={`Call with ${name}`}
          sx={{
            position: 'fixed',
            inset: 0,
            // Above MUI's dialogs, snackbars and tooltips: nothing else belongs on
            // top of a call.
            zIndex: 1600,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            pt: 'calc(env(safe-area-inset-top) + 72px)',
            pb: 'calc(env(safe-area-inset-bottom) + 56px)',
            ...stageBackground,
            color: onImage.ink
          }}
        >
          {/* The stage: their picture under everything else, edge to edge, as a phone call shows it. Their
            screen is shown whole (it is read, not filled to the edges); their camera fills the screen when
            it is the same way round. Tapping it clears the controls off it. */}
          {viewing && (
            <Box
              data-testid="call-stage"
              onClick={() => setControlsHidden((hidden) => !hidden)}
              sx={{ position: 'absolute', inset: 0, zIndex: 0, bgcolor: onImage.backdrop }}
            >
              {theirScreen ? (
                <LiveVideo stream={theirScreen} label={`${name}’s screen`} fit="contain" sx={{ borderRadius: 0 }} />
              ) : (
                <LiveVideo stream={theirCamera} label={`${name}’s camera`} fit="camera" sx={{ borderRadius: 0 }} />
              )}
            </Box>
          )}
          {/* Shade at the top and bottom, so white text and buttons read over a bright picture. */}
          {viewing && (
            <Box
              aria-hidden
              sx={{
                ...overStage,
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: `linear-gradient(to bottom, ${onImage.scrim} 0%, transparent 22%, transparent 65%, ${onImage.scrimStrong} 100%)`
              }}
            />
          )}

          {onSelectMicrophone && state.phase !== 'ended' && (
            <IconButton
              aria-label="Call audio settings"
              onClick={() => setAudioOpen(true)}
              sx={{
                ...overStage,
                position: 'absolute',
                top: 'calc(env(safe-area-inset-top) + 12px)',
                right: 12,
                color: onImage.ink
              }}
            >
              <HeadsetMicIcon />
            </IconButton>
          )}

          {onMinimize && (talking || state.phase === 'outgoing') && (
            <IconButton
              aria-label="Minimize call"
              onClick={onMinimize}
              sx={{
                ...overStage,
                position: 'absolute',
                top: 'calc(env(safe-area-inset-top) + 12px)',
                left: 12,
                color: onImage.ink
              }}
            >
              <CloseFullscreenIcon />
            </IconButton>
          )}

          <Box
            sx={{
              ...overStage,
              display: 'flex',
              flexDirection: viewing ? 'row' : 'column',
              alignItems: 'center',
              gap: viewing ? 1.5 : 2,
              textAlign: viewing ? 'left' : 'center'
            }}
          >
            <PersonAvatar name={name} picture={state.peer?.picture ?? null} size={viewing ? 40 : 112} />
            <Box>
              <Typography variant={viewing ? 'subtitle1' : 'h5'} sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
              <Typography
                variant="body1"
                aria-live="polite"
                sx={{ color: SOFT_INK, fontVariantNumeric: 'tabular-nums', maxWidth: 320 }}
              >
                {statusText(state, elapsed)}
              </Typography>
              {(state.screenMessage ?? state.cameraMessage) && (
                <Typography role="alert" variant="body2" sx={{ color: 'error.light', maxWidth: 320, mt: 0.5 }}>
                  {state.screenMessage ?? state.cameraMessage}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Small pictures: you, and their camera when their screen has the stage. Over the stage they sit in
            the corner above the buttons, and stay when the controls are cleared: you still want to see yourself.
            Without a stage they sit in a row above the buttons. */}
          {(ownCamera || (theirScreen && theirCamera)) && (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                ...(viewing
                  ? {
                      position: 'absolute',
                      zIndex: 1,
                      right: 12,
                      // Clear of the buttons: 68 for the button, 8 and 20 for its label, and 16 to spare.
                      bottom: 'calc(env(safe-area-inset-bottom) + 56px + 112px)',
                      flexDirection: 'column',
                      '& > *': { width: { xs: 96, sm: 160 }, height: { xs: 128, sm: 120 } }
                    }
                  : { justifyContent: 'center', mb: 2, height: 96, '& > *': { width: 128, height: '100%' } })
              }}
            >
              {theirScreen && theirCamera && (
                <Box sx={{ boxShadow: `0 4px 16px ${onImage.scrimStrong}`, borderRadius: 1.5 }}>
                  <LiveVideo stream={theirCamera} label={`${name}’s camera`} />
                </Box>
              )}
              {ownCamera && (
                <Box sx={{ position: 'relative', boxShadow: `0 4px 16px ${onImage.scrimStrong}`, borderRadius: 1.5 }}>
                  {/* Mirrored when it faces you, as a mirror would show you; the back camera shows the world as it is. */}
                  <LiveVideo stream={ownCamera} label="Your camera" mirror={state.cameraFacing === 'user'} />
                  {onFlipCamera && state.canFlipCamera && (
                    <IconButton
                      aria-label="Flip camera"
                      size="small"
                      onClick={onFlipCamera}
                      sx={{ position: 'absolute', right: 4, bottom: 4, color: onImage.ink, bgcolor: onImage.scrim, '&:hover': { bgcolor: onImage.scrimStrong } }}
                    >
                      <FlipCameraAndroidIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              )}
            </Box>
          )}

          <Box sx={{ ...overStage, display: 'flex', gap: 6, justifyContent: 'center' }}>
            {state.phase === 'incoming' && (
              <>
                <RoundButton label="Decline" color={RED} onClick={onDecline}>
                  <CallEndIcon />
                </RoundButton>
                <RoundButton label="Answer" color={GREEN} onClick={onAccept}>
                  <CallIcon />
                </RoundButton>
              </>
            )}

            {(talking || state.phase === 'outgoing') && (
              <>
                {talking && (
                  <RoundButton
                    label={state.muted ? 'Unmute' : 'Mute'}
                    color={state.muted ? onImage.ink : GLASS}
                    onClick={onToggleMute}
                  >
                    {state.muted ? <MicOffIcon sx={{ color: onImage.backdrop }} /> : <MicIcon />}
                  </RoundButton>
                )}
                {state.phase === 'active' && onToggleCamera && (
                  <RoundButton
                    label={state.cameraOn ? 'Camera off' : 'Camera on'}
                    color={state.cameraOn ? onImage.ink : GLASS}
                    onClick={onToggleCamera}
                  >
                    {state.cameraOn ? <VideocamIcon sx={{ color: onImage.backdrop }} /> : <VideocamOffIcon />}
                  </RoundButton>
                )}
                {state.phase === 'active' && onToggleScreen && (
                  <RoundButton
                    label={state.sharingScreen ? 'Stop sharing' : 'Share screen'}
                    color={state.sharingScreen ? onImage.ink : GLASS}
                    onClick={onToggleScreen}
                  >
                    {state.sharingScreen ? <StopScreenShareIcon sx={{ color: onImage.backdrop }} /> : <ScreenShareIcon />}
                  </RoundButton>
                )}
                <RoundButton label="End" color={RED} onClick={onHangUp}>
                  <CallEndIcon />
                </RoundButton>
              </>
            )}

            {state.phase === 'ended' && (
              <RoundButton label="Close" color={GLASS} onClick={onDismiss}>
                <CallEndIcon />
              </RoundButton>
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
