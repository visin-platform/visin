import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

/** A speech recognizer the test drives: it says what it hears when told to. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  throwOnStart = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (this.throwOnStart) throw new Error('already started');
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
  /** `from` is the first result that is new: the ones before it were reported in an earlier event. */
  hear(parts: Array<[text: string, final: boolean]>, from = 0) {
    this.onresult?.({
      resultIndex: from,
      results: Object.assign(
        parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
        {}
      )
    });
  }
}
const current = () => FakeRecognition.instances.at(-1)!;

function setup({ initial = '', disabled = false } = {}) {
  const send = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return <Composer label="Ask" value={value} onChange={setValue} onSend={send} disabled={disabled} />;
  }
  render(<Harness />);
  return { input: screen.getByRole('textbox') as HTMLTextAreaElement, send };
}
const mic = () => screen.getByRole('button', { name: /Dictate|Stop dictating/ });

beforeEach(() => {
  FakeRecognition.instances = [];
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
});
afterEach(() => vi.unstubAllGlobals());

it('has no microphone where the browser cannot dictate', () => {
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  setup();
  expect(screen.queryByRole('button', { name: /Dictate/ })).not.toBeInTheDocument();
});

it('uses the prefixed recognizer of Chrome and Safari', () => {
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  setup();
  fireEvent.click(mic());
  expect(current().started).toBe(true);
});

it('listens in the browser’s language, continuously, and shows it is listening', () => {
  const { input } = setup();
  expect(mic()).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(mic());
  expect(current()).toMatchObject({ continuous: true, interimResults: true, started: true });
  expect(current().lang).toBeTruthy();
  expect(mic()).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Stop dictating' })).toBeInTheDocument();
  expect(screen.getByText(/Listening/)).toBeInTheDocument();
  expect(input.value).toBe('');
});

it('writes what is heard as it comes, and settles it, keeping what was already written', () => {
  const { input } = setup({ initial: 'Compare these runs' });
  fireEvent.click(mic());
  act(() => current().hear([['and tell me which', false]]));
  expect(input.value).toBe('Compare these runs and tell me which');
  act(() => current().hear([['and tell me which one is best', true]]));
  expect(input.value).toBe('Compare these runs and tell me which one is best');
  act(() => current().hear([['and tell me which one is best', true], [' at night', false]], 1));
  expect(input.value).toBe('Compare these runs and tell me which one is best at night');
});

it('does not put a space before the first words of an empty box, or after one that already ends in one', () => {
  const empty = setup();
  fireEvent.click(mic());
  act(() => current().hear([['hello', true]]));
  expect(empty.input.value).toBe('hello');
});

it('stops when asked, and the words stay', () => {
  const { input } = setup();
  fireEvent.click(mic());
  act(() => current().hear([['summarize this', true]]));
  fireEvent.click(screen.getByRole('button', { name: 'Stop dictating' }));
  expect(current().stopped).toBe(true);
  expect(mic()).toHaveAttribute('aria-pressed', 'false');
  expect(input.value).toBe('summarize this');
});

it('stops when the browser ends listening by itself (a pause, a timeout)', () => {
  setup();
  fireEvent.click(mic());
  act(() => current().onend?.());
  expect(mic()).toHaveAttribute('aria-pressed', 'false');
});

it('hands over to the keyboard: typing stops dictation rather than being written over', () => {
  const { input } = setup();
  fireEvent.click(mic());
  act(() => current().hear([['hello', false]]));
  fireEvent.change(input, { target: { value: 'hello, and then I typed' } });
  expect(current().stopped).toBe(true);
  expect(input.value).toBe('hello, and then I typed');
});

it('stops when the message is sent', () => {
  const { input, send } = setup();
  fireEvent.click(mic());
  act(() => current().hear([['summarize this', true]]));
  fireEvent.submit(input.closest('form')!);
  expect(current().stopped).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it('says what to do about a blocked microphone, a missing one and a lost connection, and nothing for silence', () => {
  setup();
  fireEvent.click(mic());
  act(() => current().onerror?.({ error: 'not-allowed' }));
  act(() => current().onend?.());
  expect(screen.getByText(/microphone is blocked/i)).toBeInTheDocument();
  fireEvent.click(mic());
  expect(screen.queryByText(/microphone is blocked/i)).not.toBeInTheDocument();
  act(() => current().onerror?.({ error: 'audio-capture' }));
  expect(screen.getByText('No microphone was found.')).toBeInTheDocument();
  act(() => current().onend?.());
  fireEvent.click(mic());
  act(() => current().onerror?.({ error: 'network' }));
  expect(screen.getByText(/speech service/i)).toBeInTheDocument();
  act(() => current().onend?.());
  fireEvent.click(mic());
  act(() => current().onerror?.({ error: 'no-speech' }));
  act(() => current().onerror?.({ error: 'aborted' }));
  expect(screen.queryByText(/blocked|No microphone|speech service/)).not.toBeInTheDocument();
});

it('says when listening could not start', () => {
  setup();
  FakeRecognition.prototype.start = function start() {
    throw new Error('busy');
  };
  fireEvent.click(mic());
  expect(screen.getByText('Could not start listening. Try again.')).toBeInTheDocument();
  expect(mic()).toHaveAttribute('aria-pressed', 'false');
  FakeRecognition.prototype.start = function start() {
    this.started = true;
  };
});

it('cannot be used while the box cannot be written in', () => {
  setup({ disabled: true });
  expect(mic()).toBeDisabled();
});

it('is let go of when the composer goes, without writing into it afterwards', () => {
  const { input } = setup();
  fireEvent.click(mic());
  const listener = current();
  act(() => listener.hear([['kept', true]]));
  const before = input.value;
  cleanup();
  expect(listener.aborted).toBe(true);
  expect(listener.onresult).toBeNull();
  expect(before).toBe('kept');
});

it('says, before it is used, where the audio goes', async () => {
  setup();
  await userEvent.hover(mic());
  expect(await screen.findByRole('tooltip')).toHaveTextContent(/audio goes to Google, not to Visin/);
});

it('stops on Enter and ignores late speech results after sending', () => {
  const { input, send } = setup();
  fireEvent.click(mic());
  const listener = current();
  act(() => listener.hear([['summarize this', false]]));
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledTimes(1);
  expect(listener.stopped).toBe(true);
  act(() => listener.hear([['late result', true]]));
  expect(input.value).toBe('summarize this');
});

it('ignores late results after typing takes over', () => {
  const { input } = setup();
  fireEvent.click(mic());
  const listener = current();
  act(() => listener.hear([['hello', false]]));
  fireEvent.change(input, { target: { value: 'my edited draft' } });
  act(() => listener.hear([['hello again', true]]));
  expect(input.value).toBe('my edited draft');
});

it('rebuilds revised final results without duplicating words', () => {
  const { input } = setup();
  fireEvent.click(mic());
  act(() => current().hear([['hello', true]]));
  act(() => current().hear([['hello', true], [' world', true]], 0));
  expect(input.value).toBe('hello world');
});
