/**
 * What an evaluation of the comparison fixture reported observing. The fixture gives each suite the evidence of a
 * faithful run, with `$digest` for the suite's own protocol digest; an evaluation without `evidence` carries that,
 * an object replaces those keys, `null` carries nothing, and a promoted (`attested`) result carries nothing either:
 * none is invented for it.
 */
export function fixtureEvidence(
  suiteEvidence: Record<string, unknown>,
  evaluation: { evidence?: Record<string, unknown> | null; attested?: boolean },
  digest: string
): Record<string, unknown> | undefined {
  if (evaluation.attested || evaluation.evidence === null) return undefined;
  const merged = { ...suiteEvidence, ...evaluation.evidence };
  return JSON.parse(JSON.stringify(merged).replace('"$digest"', JSON.stringify(digest)));
}
