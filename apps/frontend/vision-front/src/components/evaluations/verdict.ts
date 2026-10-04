import type { EvidenceLevel, PublicSuite, ValidationReason, ValidationState } from '../../types/evaluation';
import { describeData } from './sources';

export const STATE_META: Record<ValidationState, { label: string; color: 'success' | 'warning' | 'error' | 'default'; meaning: string }> = {
  eligible: { label: 'Ranked', color: 'success', meaning: 'Complete, in range and on the suite’s protocol, so it can be ranked.' },
  incomplete: { label: 'Incomplete', color: 'warning', meaning: 'Something the suite requires is missing.' },
  incompatible: { label: 'Incompatible', color: 'error', meaning: 'It measured something other than what the suite measures.' },
  exploratory: { label: 'Exploratory', color: 'default', meaning: 'No suite was named, so it is kept but never ranked.' },
  'legacy-unverified': { label: 'Legacy', color: 'default', meaning: 'Recorded before suites existed, so it is kept but never ranked.' }
};

export const EVIDENCE_META: Record<EvidenceLevel, { label: string; meaning: string }> = {
  observed: { label: 'Observed', meaning: 'The evaluator sent the data, protocol and evaluator it ran, and each matched the suite. Visin has not verified them.' },
  reported: { label: 'Reported', meaning: 'Ranked on the submitter’s word: the evaluator sent little or no evidence about the data, protocol or evaluator. Sending it marks a result observed.' },
  attested: { label: 'Attested', meaning: 'A project manager promoted an older result and vouched for its checkpoint and sample counts. Nothing was observed.' },
  none: { label: 'Not ranked', meaning: 'The result names no suite, so it carries no evidence level.' }
};

/** The level's label; reports judged by the first rules carry none and read as not ranked. */
export const evidenceLabel = (level: EvidenceLevel | undefined): string => EVIDENCE_META[level ?? 'none'].label;

const quoted = (text: string | undefined) => `“${text ?? ''}”`;

/** `night/mIoU` is a condition and the metric in it. */
const splitDetail = (detail: string | undefined): [string, string] => {
  const [first, ...rest] = (detail ?? '').split('/');
  return [first, rest.join('/')];
};

/** One sentence for a reason code, in the words a person would say it. Unknown codes read as themselves. */
export function reasonText({ code, detail }: ValidationReason): string {
  switch (code) {
    case 'no-suite':
      return 'No suite was named, so this result is kept but never ranked.';
    case 'evaluation-failed':
      return 'The run failed, so there are no results to rank.';
    case 'results-not-an-object':
      return 'The results are not an object of conditions.';
    case 'no-checkpoint':
      return 'It does not say which checkpoint was scored.';
    case 'missing-condition':
      return `The ${quoted(detail)} condition has no results.`;
    case 'missing-metric': {
      const [condition, metric] = splitDetail(detail);
      return `The ${quoted(condition)} condition has no number for ${quoted(metric)}.`;
    }
    case 'missing-sample-count':
      return `It does not say how many samples ${quoted(detail)} scored.`;
    case 'missing-overall':
      return `The suite needs the evaluator’s own overall ${quoted(detail)}, and the result has none.`;
    case 'protocol-mismatch':
      return 'It was run on a different protocol than this suite version.';
    case 'no-data-evidence':
      return 'The evaluator did not say which data it scored, so the result is reported, not observed.';
    case 'data-mismatch':
      return `The data it scored is not the data this suite pins (${detail ?? 'identity'} differs).`;
    case 'no-protocol-evidence':
      return 'The evaluator did not send the digest of the protocol it ran, so the result is reported, not observed.';
    case 'no-evaluator-evidence':
      return 'The evaluator did not say which package and version produced the scores, so the result is reported, not observed.';
    case 'evaluator-mismatch':
      return `It was scored by ${quoted(detail)}, not the evaluator this suite names.`;
    case 'evaluator-unsupported':
      return `The evaluator is older than the suite allows (${detail ?? 'version'}).`;
    case 'class-mismatch':
      return `The ${detail === 'ignored' ? 'ignored' : 'scored'} classes differ from the suite’s.`;
    case 'metric-out-of-range': {
      const [condition, metric] = splitDetail(detail);
      return `${quoted(metric)} in ${quoted(condition)} is outside the range the suite allows, usually another scale.`;
    }
    case 'sample-count-mismatch':
      return `${quoted(detail)} scored a different number of samples than the suite says.`;
    case 'submitted-overall-differs':
      return `The overall ${quoted(detail)} that was sent differs from the one computed from the conditions; the computed one is used.`;
    default:
      return detail ? `${code}: ${detail}` : code;
  }
};

export { checkpointLabel } from './sources';

/** A score in a table: always four decimals, so a column lines up and a zero reads as the zero it is. */
export const formatFixed = (value: number): string => value.toFixed(4);

/** A number as a reader would write it: four significant digits, and no trailing zeros. */
export const formatScore = (value: number): string => String(Number(value.toPrecision(4)));

/** What a public suite's data is, in a line. A Visin dataset is only ever said to be one: its id is not public. */
export const publicDataText = (data: PublicSuite['data']): string => describeData(data);
