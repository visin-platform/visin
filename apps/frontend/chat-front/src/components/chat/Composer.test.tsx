import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Composer } from './Composer';

const bots = [
  { id: 'a', name: 'Reviewer', personality: '', available: true },
  { id: 'b', name: 'Research helper', personality: '', available: true },
  { id: 'c', name: 'Resting', personality: '', available: false }
];
function setup(initial = '', disabled = false) {
  const send = vi.fn(),
    choose = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial),
      [target, setTarget] = useState('');
    return (
      <Composer
        label="Message"
        value={value}
        onChange={setValue}
        onSend={send}
        assistants={bots}
        selectedAssistantId={target}
        disabled={disabled}
        onMention={(id) => {
          choose(id);
          setTarget(id);
        }}
      />
    );
  }
  render(<Harness />);
  return { input: screen.getByRole('textbox'), send, choose };
}
it('selects an attached assistant with the keyboard before sending', () => {
  const { input, send, choose } = setup();
  fireEvent.change(input, { target: { value: '@re' } });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(choose).toHaveBeenLastCalledWith('b');
  expect(input).toHaveValue('@Research helper ');
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledOnce();
});
it('preserves surrounding text and clears the recipient when the selected mention is edited', () => {
  const { input, choose } = setup('Hello @rev rest');
  fireEvent.select(input, { target: { selectionStart: 10, selectionEnd: 10 } });
  fireEvent.click(screen.getByRole('option', { name: '@Reviewer' }));
  expect(input).toHaveValue('Hello @Reviewer  rest');
  expect(choose).toHaveBeenLastCalledWith('a');
  fireEvent.change(input, { target: { value: 'Hello rest' } });
  expect(choose).toHaveBeenLastCalledWith('');
});
it('keeps typed names inert and respects dismissal, newlines, and composition', () => {
  const { input, send, choose } = setup();
  fireEvent.change(input, { target: { value: '@Rev' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(choose).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});
it('does not suggest email fragments or recipients while disabled', () => {
  const { input, send } = setup('person@re', true);
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).not.toHaveBeenCalled();
});
it('keeps mention insertion within the message limit', () => {
  setup(`${'x'.repeat(7996)} @r`);
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});

it('inserts an emoji at the selected text without sending the message', () => {
  const { input, send } = setup('Hello world');
  (input as HTMLTextAreaElement).setSelectionRange(6, 11);
  fireEvent.click(screen.getByRole('button', { name: 'Choose emoji' }));
  fireEvent.click(screen.getByRole('button', { name: 'Smiling face' }));
  expect(input).toHaveValue('Hello 😊');
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).not.toBeInTheDocument();
});

it('disables the emoji picker when messaging is disabled', () => {
  setup('', true);
  expect(screen.getByRole('button', { name: 'Choose emoji' })).toBeDisabled();
});

function commandSetup({ commands = true, onStop }: { commands?: boolean; onStop?: () => void } = {}) {
  const send = vi.fn();
  function Harness() {
    const [value, setValue] = useState('');
    return <Composer label="Ask" value={value} onChange={setValue} onSend={send} commands={commands} onStop={onStop} />;
  }
  render(<Harness />);
  return { input: screen.getByRole('textbox') as HTMLTextAreaElement, send };
}

it('offers commands for a slash and writes the whole question for the one chosen', () => {
  const { input, send } = commandSetup();
  fireEvent.change(input, { target: { value: '/' } });
  expect(screen.getByRole('listbox', { name: 'Commands' })).toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(5);
  fireEvent.change(input, { target: { value: '/su' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.value).toMatch(/^Summarize what the results show/);
  // It is put in the box to read and change, not sent.
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByRole('listbox', { name: 'Commands' })).not.toBeInTheDocument();
});

it('moves through the commands with the arrows, takes one with Tab or a click, and lets Escape close the list', () => {
  const { input } = commandSetup();
  fireEvent.change(input, { target: { value: '/' } });
  expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(screen.getAllByRole('option')[4]).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox', { name: 'Commands' })).not.toBeInTheDocument();
  expect(input.value).toBe('/');

  fireEvent.change(input, { target: { value: '/w' } });
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toMatch(/^Where does this model perform worst/);
  fireEvent.change(input, { target: { value: '/n' } });
  fireEvent.click(screen.getByRole('option'));
  expect(input.value).toMatch(/^What should I try next/);
});

it('offers no commands where they are not asked for, or to a sentence that merely contains a slash', () => {
  const off = commandSetup({ commands: false });
  fireEvent.change(off.input, { target: { value: '/' } });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('sends on Enter as usual when no command list is showing', () => {
  const { input, send } = commandSetup();
  fireEvent.change(input, { target: { value: 'compare these' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledTimes(1);
});

it('puts Stop where Send was while an answer is being written, and Escape does the same', () => {
  const onStop = vi.fn();
  const { input, send } = commandSetup({ onStop });
  expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stop the analyst' }));
  expect(onStop).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(onStop).toHaveBeenCalledTimes(2);
  expect(send).not.toHaveBeenCalled();
});

it('has Send, and an Escape that does nothing, when there is nothing to stop', () => {
  const { input } = commandSetup();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Stop the analyst' })).not.toBeInTheDocument();
  expect(() => fireEvent.keyDown(input, { key: 'Escape' })).not.toThrow();
});

it('lets Escape close an open mention list before it stops anything', () => {
  const onStop = vi.fn();
  render(<Composer label="Ask" value="@re" onChange={() => undefined} onSend={() => undefined} assistants={bots} onMention={() => undefined} onStop={onStop} />);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(onStop).not.toHaveBeenCalled();
});
