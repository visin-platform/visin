import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DatasetContentsCard from './DatasetContentsCard';

describe('DatasetContentsCard', () => {
  it('summarizes file types and the folder tree, by folder name', () => {
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
    expect(screen.getByText('front')).toHaveAttribute('title', 'camera/front');
    expect(screen.getByText('deep')).toHaveAttribute('title', 'camera/front/deep');
    expect(screen.queryByText('(zip root)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Deeper folders are left out/)).not.toBeInTheDocument();
  });

  it('says when the deepest folders are left out', () => {
    const folders = Array.from({ length: 250 }, (_, i) => ({ path: `seq/${i}`, depth: 2, files: 1, images: 1, jsons: 0, bytes: 1 }));
    render(
      <DatasetContentsCard
        contents={{ entries: 250, totalBytes: 250, truncated: false, extensions: [], folders: [{ path: 'seq', depth: 1, files: 250, images: 250, jsons: 0, bytes: 250 }, ...folders] }}
      />
    );
    expect(screen.getByText('seq')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText(/Deeper folders are left out/)).toBeInTheDocument();
  });
});
