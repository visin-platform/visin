import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MediaComposer } from './MediaComposer';
import { uploadAttachment } from '../../services/attachmentUpload';

vi.mock('../../services/attachmentUpload', () => ({ FILE_ACCEPT: '.png,.pdf', uploadAttachment: vi.fn() }));
const recorder = vi.hoisted(() => ({
  state: 'idle',
  cancel: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  supported: true,
  elapsedMs: 1000,
  levels: [0.2, 0.6],
  error: null
}));
vi.mock('../../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => recorder }));
const reference = { fileId: 'chat/c/file.png', name: 'file.png', mime: 'image/png' };
beforeEach(() => {
  vi.mocked(uploadAttachment).mockReset();
  recorder.state = 'idle';
});
const mount = () => {
  const send = vi.fn().mockResolvedValue(true);
  const header = document.createElement('header');
  document.body.append(header);
  const view = render(
    <MediaComposer
      voiceTarget={header}
      conversationId="c"
      filesEnabled
      label="Message"
      value=""
      onChange={vi.fn()}
      onSendFiles={send}
    />
  );
  const choose = () =>
    fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: { files: [new File(['photo'], 'file.png', { type: 'image/png' })] }
    });
  return { ...view, send, choose };
};

it('keeps Send disabled while uploading, then sends an attachment without text', async () => {
  let finish!: (value: typeof reference) => void;
  vi.mocked(uploadAttachment).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { choose, send } = mount();
  choose();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await act(async () => finish(reference));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith([reference]));
  await waitFor(() => expect(screen.queryByText('file.png')).not.toBeInTheDocument());
});

it('keeps an uploaded file for retry when sending fails', async () => {
  vi.mocked(uploadAttachment).mockResolvedValue(reference);
  const { choose, send } = mount();
  send.mockResolvedValueOnce(false);
  choose();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(screen.getByText('file.png')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(uploadAttachment).toHaveBeenCalledTimes(1);
});

it('aborts uploads when leaving a conversation', () => {
  vi.mocked(uploadAttachment).mockImplementation(() => new Promise(() => {}));
  const { choose, unmount } = mount();
  choose();
  const signal = vi.mocked(uploadAttachment).mock.calls[0][2];
  unmount();
  expect(signal.aborted).toBe(true);
});

it('shows upload failures and prevents sending a broken attachment', async () => {
  vi.mocked(uploadAttachment).mockRejectedValue(new Error('File is too large'));
  const { choose, send } = mount();
  choose();
  expect(await screen.findByText('file.png: File is too large')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});

it('offers voice recording and adds a finished recording to the tray', async () => {
  vi.mocked(uploadAttachment).mockResolvedValue(reference);
  recorder.state = 'recording';
  recorder.stop.mockResolvedValue({
    blob: new Blob(['voice']),
    format: { filename: 'voice.m4a', mimetype: 'audio/mp4' },
    durationMs: 1000
  });
  mount();
  expect(screen.getByRole('status')).toHaveTextContent('Recording');
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(uploadAttachment).toHaveBeenCalled());
  expect(vi.mocked(uploadAttachment).mock.calls.at(-1)![1].name).toBe('voice.m4a');
  fireEvent.click(screen.getByRole('button', { name: 'Discard recording' }));
  expect(recorder.cancel).toHaveBeenCalled();
});

it('starts recording from the microphone button', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }));
  expect(recorder.start).toHaveBeenCalled();
});

it('shows an enabled paperclip in assistant threads without a filenames-only warning for images', async () => {
  vi.mocked(uploadAttachment).mockResolvedValue(reference);
  render(
    <MediaComposer
      conversationId="assistant"
      filesEnabled
      assistant
      label="Ask a follow-up"
      value=""
      onChange={vi.fn()}
      onSendFiles={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'Attach files' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Record voice message' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Choose attachments'), {
    target: { files: [new File(['photo'], 'file.png', { type: 'image/png' })] }
  });
  expect(screen.queryByText(/cannot be read yet/)).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
});

it('keeps the paperclip visible but disabled when uploads are not configured', () => {
  render(
    <MediaComposer
      conversationId="assistant"
      filesEnabled={false}
      assistant
      label="Ask a follow-up"
      value=""
      onChange={vi.fn()}
      onSendFiles={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'Attach files' })).toBeDisabled();
});

it('places voice recording in the conversation header instead of beside the input', () => {
  mount();
  const record = screen.getByRole('button', { name: 'Record voice message' });
  expect(record.closest('header')).not.toBeNull();
  fireEvent.click(record);
  expect(recorder.start).toHaveBeenCalled();
});

it('takes a pasted screenshot and a dropped file like chosen ones, and leaves pasted text alone', async () => {
  vi.mocked(uploadAttachment).mockResolvedValue(reference);
  mount();
  const box = screen.getByRole('textbox');
  const screenshot = new File(['png'], 'shot.png', { type: 'image/png' });
  expect(fireEvent.paste(box, { clipboardData: { files: [] } })).toBe(true);
  expect(fireEvent.paste(box, { clipboardData: { files: [screenshot] } })).toBe(false);
  await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
  fireEvent.dragOver(box, { dataTransfer: { types: ['Files'], files: [] } });
  expect(screen.getByText('Drop to attach')).toBeInTheDocument();
  fireEvent.drop(box, {
    dataTransfer: { types: ['Files'], files: [new File(['%PDF'], 'r.pdf', { type: 'application/pdf' })] }
  });
  expect(screen.queryByText('Drop to attach')).not.toBeInTheDocument();
  await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(uploadAttachment).mock.calls[1][1].name).toBe('r.pdf');
});

it('shows how loud the microphone is while recording', () => {
  recorder.state = 'recording';
  const { container } = mount();
  expect(screen.getByText('Recording 0:01')).toBeInTheDocument();
  expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(2);
});
