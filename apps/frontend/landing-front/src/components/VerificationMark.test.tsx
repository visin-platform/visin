import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerificationMark from './VerificationMark';

it.each([true, false])('explains the verification checkmark on hover and keyboard focus (%s)', async verified => {
  render(<VerificationMark verified={verified} />);
  const mark = screen.getByRole('img', { name: verified ? 'Verified' : 'Not verified' });
  await userEvent.hover(mark);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(verified ? 'Verified by a manager or an automated job.' : 'Not yet verified by a manager or an automated job.');
  expect(mark).toHaveAttribute('tabindex', '0');
});
