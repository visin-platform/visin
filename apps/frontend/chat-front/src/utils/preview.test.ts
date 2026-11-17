import { expect, it } from 'vitest';
import { plainPreview } from './preview';

it('removes Markdown marks and keeps the words', () => {
  expect(plainPreview('**Largest gain: CLFTv2-Base fusion `6acfa4b81`')).toBe('Largest gain: CLFTv2-Base fusion 6acfa4b81');
  expect(plainPreview('## Result\n\n- first\n- second')).toBe('Result first second');
  expect(plainPreview('See [the run](https://example.test/r/1) and *this* one')).toBe('See the run and this one');
});

it('drops code blocks and leaves plain text as it was', () => {
  expect(plainPreview('Before\n```\nlong code\n```\nAfter')).toBe('Before After');
  expect(plainPreview('Would you like me to read one of the runs?')).toBe('Would you like me to read one of the runs?');
});
