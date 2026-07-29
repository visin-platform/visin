import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageViewDialog from './ImageViewDialog';
import { Visualization } from '../../types';

const image: Visualization = {
  _id: 'v1',
  epoch_uuid: 'e1',
  visualization_uuid: 'viz-1',
  filename: 'result.png',
  type: 'overlay',
  fileId: 'file1',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  signedUrl: 'https://example.com/result.png',
  epoch: 3,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

describe('ImageViewDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<ImageViewDialog open={false} onClose={vi.fn()} selectedImage={image} />);
    expect(screen.queryByText('result.png')).not.toBeInTheDocument();
  });

  it('renders the filename, image and metadata chips when open', () => {
    render(<ImageViewDialog open={true} onClose={vi.fn()} selectedImage={image} />);
    expect(screen.getByText('result.png')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/result.png');
    expect(screen.getByText('overlay')).toBeInTheDocument();
    expect(screen.getByText('Epoch 3')).toBeInTheDocument();
  });

  it('does not render the image or chips when selectedImage is null', () => {
    render(<ImageViewDialog open={true} onClose={vi.fn()} selectedImage={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    render(<ImageViewDialog open={true} onClose={onClose} selectedImage={image} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
