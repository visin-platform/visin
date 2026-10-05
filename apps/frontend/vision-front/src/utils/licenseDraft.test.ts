import { describe, expect, it } from 'vitest';
import { declaredLicenseOf, EMPTY_LICENSE_DRAFT, licenseDraftOf } from './licenseDraft';

describe('licenseDraftOf', () => {
  it('starts empty when nothing is declared, and from the id for a listed licence', () => {
    expect(licenseDraftOf(undefined)).toEqual(EMPTY_LICENSE_DRAFT);
    expect(licenseDraftOf({ id: 'mit', name: 'MIT', url: 'https://opensource.org/license/mit' })).toEqual({ id: 'mit', name: '', url: '' });
  });

  it('keeps the name and link of a licence of the other kind', () => {
    expect(licenseDraftOf({ id: 'other', name: 'Acme terms', url: 'https://acme.test/t' })).toEqual({ id: 'other', name: 'Acme terms', url: 'https://acme.test/t' });
    expect(licenseDraftOf({ id: 'other', name: 'Acme terms' })).toEqual({ id: 'other', name: 'Acme terms', url: '' });
  });
});

describe('declaredLicenseOf', () => {
  it('declares nothing as null, which takes a declaration back', () => {
    expect(declaredLicenseOf(EMPTY_LICENSE_DRAFT)).toEqual({ license: null });
  });

  it('sends a listed licence as its id alone, however the form was filled in earlier', () => {
    expect(declaredLicenseOf({ id: 'mit', name: 'leftover', url: 'https://leftover.test' })).toEqual({ license: { id: 'mit' } });
  });

  it('needs a name for the other kind, and an http(s) link when there is one', () => {
    expect(declaredLicenseOf({ id: 'other', name: '  ', url: '' })).toEqual({ error: 'Name the licence, or choose one from the list' });
    expect(declaredLicenseOf({ id: 'other', name: 'Acme', url: 'ftp://acme.test' })).toEqual({ error: 'The licence link must start with http:// or https://' });
    expect(declaredLicenseOf({ id: 'other', name: ' Acme ', url: ' https://acme.test/t ' })).toEqual({ license: { id: 'other', name: 'Acme', url: 'https://acme.test/t' } });
    expect(declaredLicenseOf({ id: 'other', name: 'Acme', url: '' })).toEqual({ license: { id: 'other', name: 'Acme' } });
  });
});
