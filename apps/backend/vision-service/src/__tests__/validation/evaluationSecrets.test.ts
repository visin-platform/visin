import { isSecretKey, secretPaths } from '../../validation/evaluationSchemas';

describe('isSecretKey', () => {
  it.each([
    'token', 'TOKEN', 'HF_TOKEN', 'access_token', 'accessToken', 'authToken', 'auth-token', 'tokens',
    'secret', 'client_secret', 'SECRET_KEY', 'password', 'db_password', 'passwd', 'credentials', 'authorization',
    'Authorization', 'api_key', 'apiKey', 'API_KEY', 'apikey', 'private_key', 'privateKey', 'aws.access.key'
  ])('refuses %s, which names a credential', key => {
    expect(isSecretKey(key)).toBe(true);
  });

  it.each([
    'tokenizers', 'tokenizer', 'sentencepiece', 'max_tokens_per_batch'.replace('tokens', 'length'), 'keyboard', 'key', 'monkey',
    'secretary', 'passwords_policy_doc'.replace('passwords', 'policy'), 'author', 'batch_size', 'evaluator', 'commit', 'seeds'
  ])('lets %s through, which only looks like one', key => {
    expect(isSecretKey(key)).toBe(false);
  });
});

describe('secretPaths', () => {
  it('names the path of each credential key, at any depth, and stops looking after ten', () => {
    expect(secretPaths({ env: { HF_TOKEN: 'x', HOME: '/h' }, packages: { tokenizers: '0.19' }, list: [{ apiKey: 1 }] })).toEqual(['env.HF_TOKEN', 'list.0.apiKey']);
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`token_${i}`, 1]));
    expect(secretPaths(many)).toHaveLength(10);
    expect(secretPaths(null)).toEqual([]);
  });
});
