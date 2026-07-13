import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageLightboxDialog from './ImageLightboxDialog';
import type { DatasetImage } from '../../services/datasetImageService';

const image = {
  _id: 'i1',
  signedUrl: 'http://img/1.jpg',
  title: 'My Photo',
  originalName: 'orig.jpg',
} as unknown as DatasetImage;

describe('ImageLightboxDialog', () => {
  it('renders the image with its title as alt text', () => {
    render(<ImageLightboxDialog open image={image} onClose={vi.fn()} />);

    const img = screen.getByAltText('My Photo');
    expect(img).toHaveAttribute('src', 'http://img/1.jpg');
  });

  it('falls back to originalName for alt text when no title', () => {
    render(<ImageLightboxDialog open image={{ ...image, title: undefined }} onClose={vi.fn()} />);

    expect(screen.getByAltText('orig.jpg')).toBeInTheDocument();
  });

  it('renders nothing image-related when image is null', () => {
    render(<ImageLightboxDialog open image={null} onClose={vi.fn()} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightboxDialog open image={image} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
