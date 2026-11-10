import { useCallback, useEffect, useRef, useState } from 'react';

/** The parts of the browser's speech recognition this uses. It is not in TypeScript's DOM types. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => Recognition;

const constructorOf = (): RecognitionConstructor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const found = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return found.SpeechRecognition ?? found.webkitSpeechRecognition;
};

/** Whether this browser can turn speech into text at all. Chrome and Safari can; Firefox cannot. */
export const canDictate = (): boolean => constructorOf() !== undefined;

/** What went wrong, in words, for the errors a person can do something about. Silence and cancelling are not errors. */
const PROBLEMS: Record<string, string> = {
  'not-allowed': 'The microphone is blocked. Allow it for this site in your browser’s settings.',
  'service-not-allowed': 'Your browser’s speech service is not available here.',
  'audio-capture': 'No microphone was found.',
  network: 'Could not reach the speech service. Check your connection.'
};

/**
 * Dictation into a text box. What was already written stays; what is said is added after it, shown as it is heard,
 * and settled when the browser is sure. Stops when asked, when nothing is said for a while, when the box is not
 * usable any more, and when the component goes.
 *
 * The browser does the listening. In Chrome that means the audio goes to Google's speech service, which the button
 * says; nothing is sent to Visin.
 */
export function useSpeechInput({
  value,
  onChange,
  maxLength = 8000,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState('');
  const recognition = useRef<Recognition | null>(null);
  // What was in the box when listening began, and what has been heard and settled since.
  const written = useRef('');
  const latest = useRef({ onChange, maxLength });
  latest.current = { onChange, maxLength };
  const valueRef = useRef(value);
  valueRef.current = value;

  const stop = useCallback(() => {
    const listener = recognition.current;
    if (!listener) return;
    // stop() can deliver a final result asynchronously. Once the keyboard takes over or the message is sent,
    // that result must never overwrite the new draft.
    listener.onresult = listener.onerror = listener.onend = null;
    recognition.current = null;
    setListening(false);
    listener.stop();
  }, []);

  const start = useCallback(() => {
    const Recognizer = constructorOf();
    if (!Recognizer || recognition.current) return;
    setProblem('');
    const listener = new Recognizer();
    listener.lang = navigator.language || 'en-US';
    listener.continuous = true;
    listener.interimResults = true;
    written.current = valueRef.current;
    listener.onresult = (event) => {
      // Results contains the full session, including revised entries. Rebuild rather than appending final
      // entries again when a browser revisits an earlier resultIndex.
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript);
      const spoken = parts.join('').trim();
      const base = written.current;
      const gap = base && !/\s$/.test(base) && spoken ? ' ' : '';
      latest.current.onChange(`${base}${gap}${spoken}`.slice(0, latest.current.maxLength));
    };
    listener.onerror = (event) => {
      // Saying nothing, and stopping on purpose, end listening without being faults.
      if (PROBLEMS[event.error]) setProblem(PROBLEMS[event.error]);
    };
    listener.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = listener;
    try {
      listener.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setProblem('Could not start listening. Try again.');
    }
  }, []);

  const toggle = useCallback(() => (recognition.current ? stop() : start()), [start, stop]);

  // A box that cannot be written in is not listened for.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  useEffect(
    () => () => {
      const listener = recognition.current;
      if (listener) {
        listener.onresult = listener.onerror = listener.onend = null;
        listener.abort();
        recognition.current = null;
      }
    },
    []
  );

  return { supported: canDictate(), listening, problem, toggle, stop };
}
