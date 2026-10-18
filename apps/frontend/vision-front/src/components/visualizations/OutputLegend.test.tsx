import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutputLegend from './OutputLegend';

describe('OutputLegend', () => {
  it('names the classes a mask uses, and only those', () => {
    render(<OutputLegend kind="mask" classes={[{ index: 0, name: 'road' }, { index: 1, name: 'car' }]} present={[1]} />);
    expect(screen.getByRole('list', { name: 'Classes' })).toHaveTextContent('car');
    expect(screen.queryByText('road')).not.toBeInTheDocument();
  });

  it('numbers the classes when the model does not name them, and says nothing with none to show', () => {
    const { unmount } = render(<OutputLegend kind="mask" present={[0, 4]} />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Class 0', 'Class 4']);
    unmount();
    const { container } = render(<OutputLegend kind="mask" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('scales confidence from zero when the class count is not known', () => {
    render(<OutputLegend kind="confidence" />);
    expect(screen.getByLabelText('Confidence scale')).toHaveTextContent('0.001.00');
  });
});
