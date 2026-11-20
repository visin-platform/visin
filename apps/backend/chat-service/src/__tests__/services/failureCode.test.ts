import { failureCodeOf } from '../../services/failureCode';
import { ProviderRequestError } from '../../services/providers';

it.each([
  ['Your daily Vivi question allowance is used. It resets at midnight UTC.', 'limit_reached'],
  ['Your daily assistant token budget is used. It resets at midnight UTC.', 'limit_reached'],
  ['Project is no longer accessible', 'no_access'],
  ['Paper is no longer accessible', 'no_access'],
  ['Project access changed during analysis', 'no_access'],
  ['No assistant model is configured', 'assistant_off'],
  ['No Anthropic key is configured', 'assistant_off'],
  ['Vivi access is disabled for this account', 'assistant_off'],
  ['Account is not active', 'assistant_off'],
  ['Assistant access or agreement changed', 'access_changed'],
  ['Analysis cancelled', 'access_changed'],
  ['Analysis reached its tool-round limit. Ask a narrower question.', 'too_large'],
  ['Analysis token limit reached', 'too_large'],
  ['This question is too large. Ask a shorter question.', 'too_large'],
  ['Analysis was interrupted. Send your question again to retry.', 'interrupted'],
  ['An image is too large or could not be read. Try a smaller image.', 'image'],
  ['The image is too large to analyze. Choose an image up to 4 MB.', 'image'],
  [
    'Your other questions to Vivi are still running and hold what is left of today’s allowance. Try again when they finish.',
    'busy'
  ],
  ['The assistant provider reported an error. Try again later.', 'provider_error'],
  ['The assistant returned no answer', 'provider_error'],
  ['Something nobody planned for', 'other']
])('files "%s" under %s', (message, code) => {
  expect(failureCodeOf(new Error(message))).toBe(code);
});
it('treats a provider error, and a deadline, as what they are', () => {
  expect(failureCodeOf(new ProviderRequestError('Assistant provider unavailable (429)', { status: 429 }))).toBe('provider_error');
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  expect(failureCodeOf(timeout)).toBe('timeout');
  expect(failureCodeOf('not an error')).toBe('other');
});
it('keeps the day\'s allowance apart from one question being too big', () => {
  expect(failureCodeOf(new Error('Analysis token limit reached'))).not.toBe('limit_reached');
});
