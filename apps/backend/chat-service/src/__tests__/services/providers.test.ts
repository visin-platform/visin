import { withTiers } from '../../services/providers';

const models = (...ids: string[]) => ids.map((id) => ({ id, name: id }));
const tiers = (result: ReturnType<typeof withTiers>) =>
  Object.fromEntries(result.models.filter((m) => m.tier).map((m) => [m.tier, m.id]));

describe('the plain choices of model', () => {
  it("gives Anthropic's newest of each family, and recommends the balanced one", () => {
    const result = withTiers(
      'anthropic',
      models('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5', 'claude-sonnet-4-6')
    );
    expect(tiers(result)).toEqual({ best: 'claude-opus-5-5', balanced: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' });
    expect(result.recommended).toBe('claude-sonnet-5-5');
    // Every model stays in the list; older ones just stand for nothing.
    expect(result.models).toHaveLength(5);
    expect(result.models.find((m) => m.id === 'claude-opus-5')).toEqual({ id: 'claude-opus-5', name: 'claude-opus-5' });
  });

  it('never lets a dated snapshot or a preview stand for a kind', () => {
    const result = withTiers(
      'anthropic',
      models('claude-sonnet-4-5-20250929', 'claude-opus-5-preview', 'claude-sonnet-4-5', 'claude-opus-4-8')
    );
    expect(tiers(result)).toEqual({ best: 'claude-opus-4-8', balanced: 'claude-sonnet-4-5' });
  });

  it("gives OpenAI's flagship and its small sibling, and recommends the flagship", () => {
    const result = withTiers(
      'openai',
      models('gpt-5.1-2025-11-13', 'gpt-5.1', 'o4-mini', 'gpt-5.1-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-5.1-nano')
    );
    expect(tiers(result)).toEqual({ best: 'gpt-5.1', fast: 'gpt-5.1-mini' });
    expect(result.recommended).toBe('gpt-5.1');
  });

  it('falls back to what there is, and recommends nothing from a list with none of the usual kinds', () => {
    expect(withTiers('anthropic', models('claude-haiku-5-5')).recommended).toBe('claude-haiku-5-5');
    expect(withTiers('openai', models('o4-mini', 'o3')).recommended).toBeNull();
    expect(withTiers('openai', []).models).toEqual([]);
  });
});
