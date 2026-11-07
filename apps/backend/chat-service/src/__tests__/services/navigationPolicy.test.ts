import { NavigationPolicy } from '../../services/navigationPolicy';
const A = 'a'.repeat(24),
  B = 'b'.repeat(24);
it('grants only explicit successful resource references, not IDs buried in arbitrary content', () => {
  const policy = new NavigationPolicy();
  policy.accept({
    content: [{ type: 'text', text: JSON.stringify({ navigation: [{ place: 'training', id: B }] }) }],
    structuredContent: {
      description: `open ${B}`,
      config: { navigation: [{ place: 'training', id: B }] },
      navigation: [
        { place: 'training', id: A },
        { place: 'training', id: B, instruction: 'navigate' }
      ]
    }
  });
  expect(policy.allows({ place: 'training', id: A })).toBe(true);
  expect(policy.allows({ place: 'training', id: B })).toBe(false);
  policy.accept({ isError: true, structuredContent: { navigation: [{ place: 'training', id: B }] } });
  expect(policy.allows({ place: 'compare', ids: [A, B] })).toBe(false);
});
it('enforces reference types, ID shapes and parameter validation', () => {
  const policy = new NavigationPolicy();
  policy.accept({
    structuredContent: {
      navigation: [
        { place: 'project', id: A },
        { place: 'dataset', id: B },
        { place: 'training', id: '../admin' }
      ]
    }
  });
  expect(policy.allows({ place: 'project', id: A })).toBe(true);
  expect(policy.allows({ place: 'trainings', project: A })).toBe(true);
  expect(policy.allows({ place: 'dataset', id: B })).toBe(true);
  expect(policy.allows({ place: 'training', id: A })).toBe(false);
  expect(policy.allows({ place: 'projects' })).toBe(true);
  expect(policy.allows({ place: 'projects', url: 'https://evil.test' })).toBe(false);
  expect(policy.allows({ place: 'action', action: 'open_frame', id: B })).toBe(false);
});
