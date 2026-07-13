import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditImageModal from './EditImageModal';
import type { ImageCategory } from '../../services/imageCategoryService';

const categories = [{ _id: 'c1', name: 'Cars' } as unknown as ImageCategory];

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  categories,
  selectedCategory: '',
  setSelectedCategory: vi.fn(),
  selectedWeather: '' as const,
  setSelectedWeather: vi.fn(),
  selectedTags: '',
  setSelectedTags: vi.fn(),
};

describe('EditImageModal', () => {
  it('lists categories and weather conditions as select options', () => {
    render(<EditImageModal {...baseProps} />);

    expect(screen.getByRole('option', { name: 'Cars' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Snow' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No Category' })).toBeInTheDocument();
  });

  it('calls setSelectedCategory/setSelectedWeather on change', () => {
    const setSelectedCategory = vi.fn();
    const setSelectedWeather = vi.fn();
    render(<EditImageModal {...baseProps} setSelectedCategory={setSelectedCategory} setSelectedWeather={setSelectedWeather} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c1' } });
    expect(setSelectedCategory).toHaveBeenCalledWith('c1');

    fireEvent.change(screen.getByLabelText('Weather Condition'), { target: { value: 'snow' } });
    expect(setSelectedWeather).toHaveBeenCalledWith('snow');
  });

  it('calls setSelectedTags on tags input change', () => {
    const setSelectedTags = vi.fn();
    render(<EditImageModal {...baseProps} setSelectedTags={setSelectedTags} />);

    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'cat, animal' } });
    expect(setSelectedTags).toHaveBeenCalledWith('cat, animal');
  });

  it('calls onSave and onClose', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<EditImageModal {...baseProps} onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when closed', () => {
    render(<EditImageModal {...baseProps} open={false} />);

    expect(screen.queryByText('Edit Image')).not.toBeInTheDocument();
  });
});
