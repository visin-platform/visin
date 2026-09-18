import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DatasetContentsCard from './DatasetContentsCard';

describe('DatasetContentsCard', () => {
  it('summarizes file types and the top two folder levels', () => {
    render(
      <DatasetContentsCard
        contents={{
          entries: 1500,
          totalBytes: 2048,
          truncated: false,
          extensions: [{ ext: '.png', files: 1200, bytes: 1024 }],
          folders: [
            { path: '', depth: 0, files: 1500, images: 1200, jsons: 0, bytes: 2048 },
            { path: 'camera', depth: 1, files: 1200, images: 1200, jsons: 0, bytes: 1024 },
            { path: 'camera/front', depth: 2, files: 600, images: 600, jsons: 0, bytes: 512 },
            { path: 'camera/front/deep', depth: 3, files: 1, images: 1, jsons: 0, bytes: 1 }
          ]
        }}
      />
    );
    expect(screen.getByText('1,500 files, 2.0 KB uncompressed')).toBeInTheDocument();
    expect(screen.getByText('.png · 1,200 · 1.0 KB')).toBeInTheDocument();
    expect(screen.getByText('camera/front')).toBeInTheDocument();
    expect(screen.queryByText('camera/front/deep')).not.toBeInTheDocument();
    expect(screen.queryByText('(zip root)')).not.toBeInTheDocument();
  });
});
