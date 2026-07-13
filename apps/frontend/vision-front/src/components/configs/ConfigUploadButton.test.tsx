import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfigUploadButton from './ConfigUploadButton';

describe('ConfigUploadButton', () => {
  it('renders default label when not uploading', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ConfigUploadButton uploading={false} fileInputRef={ref} onFileChange={vi.fn()} />);
    expect(screen.getByText('Upload Configs')).toBeInTheDocument();
  });

  it('shows uploading label and disables the button while uploading', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ConfigUploadButton uploading={true} fileInputRef={ref} onFileChange={vi.fn()} />);
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
    expect(screen.getByText('Uploading...').closest('button')).toBeDisabled();
  });

  it('clicking the button triggers a click on the hidden file input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ConfigUploadButton uploading={false} fileInputRef={ref} onFileChange={vi.fn()} />);
    const clickSpy = vi.spyOn(ref.current as HTMLInputElement, 'click');
    fireEvent.click(screen.getByText('Upload Configs'));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onFileChange when files are selected', () => {
    const ref = createRef<HTMLInputElement>();
    const onFileChange = vi.fn();
    const { container } = render(
      <ConfigUploadButton uploading={false} fileInputRef={ref} onFileChange={onFileChange} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onFileChange).toHaveBeenCalledTimes(1);
  });
});
