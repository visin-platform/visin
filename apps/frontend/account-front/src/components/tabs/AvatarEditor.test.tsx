import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@visin/frontend-core';
import AvatarEditor from './AvatarEditor';

vi.mock('../../utils/resizeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/resizeImage')>()),
  resizeToAvatar: vi.fn(),
}));

import { AvatarError, resizeToAvatar } from '../../utils/resizeImage';

const upload = vi.fn<(image: Blob) => Promise<string>>();
const remove = vi.fn<() => Promise<void>>();
const resize = vi.mocked(resizeToAvatar);
const small = new Blob(['x'], { type: 'image/webp' });

const renderEditor = (picture?: string) => {
  const onChange = vi.fn();
  render(<AvatarEditor picture={picture} initial="A" upload={upload} remove={remove} onChange={onChange} />);
  return onChange;
};
const choose = (name = 'me.png') =>
  fireEvent.change(screen.getByTestId('picture-input'), { target: { files: [new File(['x'], name, { type: 'image/png' })] } });

beforeEach(() => {
  vi.clearAllMocks();
  resize.mockResolvedValue(small);
  upload.mockResolvedValue('https://auth.example.test/auth/avatars/u1?v=1');
  remove.mockResolvedValue();
});

describe('AvatarEditor', () => {
  it('offers an upload where there is no picture, and a change and a removal where there is', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shrinks the chosen image, sends it at once and reports the picture the server now has', async () => {
    const onChange = renderEditor();

    choose();

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://auth.example.test/auth/avatars/u1?v=1'));
    expect(resize).toHaveBeenCalledWith(expect.objectContaining({ name: 'me.png' }));
    expect(upload).toHaveBeenCalledWith(small);
  });

  it('opens the file dialog from the button, and lets the message be dismissed', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    resize.mockRejectedValue(new AvatarError('That image could not be read.'));
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Upload picture' }));
    expect(click).toHaveBeenCalled();
    choose();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByText('That image could not be read.')).not.toBeInTheDocument();
    click.mockRestore();
  });

  it('sends the picture even where nobody listens for the change', async () => {
    render(<AvatarEditor initial="A" upload={upload} remove={remove} />);

    choose();

    await waitFor(() => expect(upload).toHaveBeenCalledWith(small));
  });

  it('ignores a dialog that was cancelled', () => {
    const onChange = renderEditor();

    fireEvent.change(screen.getByTestId('picture-input'), { target: { files: [] } });

    expect(resize).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says why an image cannot be used, and sends nothing', async () => {
    resize.mockRejectedValue(new AvatarError('That image could not be read.'));
    const onChange = renderEditor();

    choose('me.heic');

    expect(await screen.findByText('That image could not be read.')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says what the server refused, and keeps anything else generic', async () => {
    upload.mockRejectedValueOnce(new ApiError(400, 'The picture must be a JPEG, PNG or WebP image'));
    renderEditor();
    choose();
    expect(await screen.findByText('The picture must be a JPEG, PNG or WebP image')).toBeInTheDocument();

    upload.mockRejectedValueOnce(new ApiError(500, 'stack trace'));
    choose();
    expect(await screen.findByText('Could not update the picture. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
  });

  it('removes the picture and reports there is none', async () => {
    const onChange = renderEditor('https://auth.example.test/auth/avatars/u1?v=1');
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
    expect(remove).toHaveBeenCalled();
  });

  it('keeps the picture when the removal fails', async () => {
    remove.mockRejectedValue(new Error('down'));
    const onChange = renderEditor('https://auth.example.test/auth/avatars/u1?v=1');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Could not update the picture. Try again.')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
