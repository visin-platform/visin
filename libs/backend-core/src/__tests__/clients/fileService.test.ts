import { fileServiceAuthHeaders, fileServiceUrl } from '../../clients/fileService';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('fileServiceUrl', () => {
  it('prefers the container-network address, and drops a trailing slash', () => {
    process.env.FILE_SERVICE_INTERNAL_URL = 'http://file-service:5002/';
    process.env.FILE_SERVICE_URL = 'https://files.example.test';
    expect(fileServiceUrl()).toBe('http://file-service:5002');
  });

  it('uses the public address when no internal one is set', () => {
    delete process.env.FILE_SERVICE_INTERNAL_URL;
    process.env.FILE_SERVICE_URL = 'https://files.example.test/';
    expect(fileServiceUrl()).toBe('https://files.example.test');
  });

  it('falls back to the host-side dev port outside production', () => {
    delete process.env.FILE_SERVICE_INTERNAL_URL;
    delete process.env.FILE_SERVICE_URL;
    process.env.NODE_ENV = 'development';
    expect(fileServiceUrl()).toBe('http://localhost:5002');
  });

  it('has no fallback in production', () => {
    delete process.env.FILE_SERVICE_INTERNAL_URL;
    delete process.env.FILE_SERVICE_URL;
    process.env.NODE_ENV = 'production';
    expect(() => fileServiceUrl()).toThrow('FILE_SERVICE_URL');
  });
});

describe('fileServiceAuthHeaders', () => {
  it('carries the API key, and refuses to go without one', () => {
    process.env.FILE_SERVICE_API_KEY = 'api-key';
    expect(fileServiceAuthHeaders()).toEqual({ 'x-internal-api-key': 'api-key' });
    delete process.env.FILE_SERVICE_API_KEY;
    expect(() => fileServiceAuthHeaders()).toThrow('FILE_SERVICE_API_KEY');
  });
});
