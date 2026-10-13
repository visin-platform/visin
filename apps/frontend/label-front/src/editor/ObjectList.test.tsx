import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ObjectList from './ObjectList';
import { EditorDocument } from './EditorDocument';
import { box, carClass, roadClass } from '../test/fixtures';

const setup = (readOnly = false) => {
  const doc = new EditorDocument(200, 100);
  doc.load([
    box('a', [0, 0, 40.4, 20.6]),
    box('b', [10, 10, 5, 5], { source: 'model', score: 0.823 }),
    box('c', [10, 10, 5, 5], { source: 'import' }),
    box('d', [10, 10, 5, 5], { source: 'model' }),
    box('e', [10, 10, 5, 5], { classKey: 'retired' })
  ]);
  const onClose = vi.fn();
  render(<ObjectList doc={doc} classes={[carClass, roadClass]} colorOf={(entry) => entry.color} onClose={onClose} readOnly={readOnly} />);
  return { doc, onClose };
};

describe('ObjectList', () => {
  it('lists each box with its class, size and where it came from', () => {
    setup();

    expect(screen.getByText('Objects (5)')).toBeInTheDocument();
    expect(screen.getByText('40×21 · drawn')).toBeInTheDocument();
    expect(screen.getByText('5×5 · model 82%')).toBeInTheDocument();
    expect(screen.getByText('5×5 · imported')).toBeInTheDocument();
    expect(screen.getByText('5×5 · model')).toBeInTheDocument();
    expect(screen.getByText('retired')).toBeInTheDocument();
  });

  it('selects a box by clicking it, and unselects it by clicking again', () => {
    const { doc } = setup();

    fireEvent.click(screen.getByText('5×5 · imported'));
    expect(doc.selectedId).toBe('c');
    fireEvent.click(screen.getByText('5×5 · imported'));
    expect(doc.selectedId).toBeNull();
  });

  it('deletes a box without selecting it, and follows the document', () => {
    const { doc } = setup();

    fireEvent.click(screen.getAllByRole('button', { name: 'delete Car' })[0]);

    expect(doc.boxes.map((entry) => entry.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(doc.selectedId).toBeNull();
    expect(screen.getByText('Objects (4)')).toBeInTheDocument();

    act(() => doc.load([]));
    expect(screen.getByText('No boxes on this frame.')).toBeInTheDocument();
  });

  it('offers no delete to a viewer, and closes', () => {
    const { onClose } = setup(true);

    expect(screen.queryByRole('button', { name: /delete/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close objects' }));
    expect(onClose).toHaveBeenCalled();
  });
});
