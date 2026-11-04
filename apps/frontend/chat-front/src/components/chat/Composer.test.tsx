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
