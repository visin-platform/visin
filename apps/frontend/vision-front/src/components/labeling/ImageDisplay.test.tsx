import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImageDisplay from './ImageDisplay';
import { DatasetImage } from '../../services/datasetImageService';

const image: DatasetImage = {
  _id: 'img1',
  filename: 'file.jpg',
  originalName: 'original.jpg',
  minioFileId: 'minio1',
  datasetId: 'ds1',
  categoryId: 'cat1',
  title: 'My Image',
  description: 'An image description',
  mimetype: 'image/jpeg',
  size: 1000,
  tags: [],
  labels: [],
  metadata: {},
  signedUrl: 'https://example.com/img.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

describe('ImageDisplay', () => {
  it('renders the image title and description', () => {
    render(<ImageDisplay currentImage={image} sessionLabels={{}} />);
    expect(screen.getByText('My Image')).toBeInTheDocument();
    expect(screen.getByText('An image description')).toBeInTheDocument();
  });

  it('falls back to originalName when no title is set', () => {
    const noTitle = { ...image, title: undefined };
    render(<ImageDisplay currentImage={noTitle} sessionLabels={{}} />);
    expect(screen.getByText('original.jpg')).toBeInTheDocument();
  });

  it('uses signedUrl as the image src', () => {
    render(<ImageDisplay currentImage={image} sessionLabels={{}} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('shows the session label badge when a label has been applied', () => {
    render(<ImageDisplay currentImage={image} sessionLabels={{ img1: 'good' }} />);
    expect(screen.getByText('good')).toBeInTheDocument();
  });

  it('shows "Skipped" for a skip session label', () => {
    render(<ImageDisplay currentImage={image} sessionLabels={{ img1: 'skip' }} />);
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });

  it('does not render a label badge when there is no session label', () => {
    render(<ImageDisplay currentImage={image} sessionLabels={{}} />);
    expect(screen.queryByText('good')).not.toBeInTheDocument();
    expect(screen.queryByText('bad')).not.toBeInTheDocument();
    expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
  });
});
