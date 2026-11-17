import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProjectThumb from './ProjectThumb';

describe('ProjectThumb', () => {
  it('shows the project’s picture where it has one', () => {
    const { container } = render(<ProjectThumb project={{ visibility: 'private', coverUrl: 'https://files.example.test/c.jpg' }} />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://files.example.test/c.jpg');
  });

  it('shows the tile that says whether it is public when it has none', () => {
    const { container } = render(<ProjectThumb project={{ visibility: 'public' }} />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('PublicIcon')).toBeInTheDocument();
  });

  it('gives way to the tile when the picture fails to load, and tries a new picture', () => {
    const { container, rerender } = render(
      <ProjectThumb project={{ visibility: 'private', coverUrl: 'https://files.example.test/gone.jpg' }} />
    );

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('FolderIcon')).toBeInTheDocument();

    rerender(<ProjectThumb project={{ visibility: 'private', coverUrl: 'https://files.example.test/new.jpg' }} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://files.example.test/new.jpg');
  });
});
