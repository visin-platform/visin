import {
  epochMetrics,
  escapeLatex,
  findingToLatex,
  inlineToLatex,
  markdownToLatex,
  type ExportRun
} from '../../services/latexExport';

const finding = (over: Record<string, unknown> = {}) => ({
  _id: 'f1',
  title: 'Window size past 16 buys nothing',
  body: 'Both configurations converge to the same mIoU.',
  authorKind: 'assistant' as const,
  authorLabel: 'Claude',
  createdAt: new Date('2026-09-06T10:00:00.000Z'),
  ...over
});

const run = (name: string, epochs: Array<[number, Record<string, unknown>]>): ExportRun => ({
  _id: name,
  name,
  epochs: epochs.map(([epoch, results]) => ({ epoch, results })) as ExportRun['epochs']
});

describe('escaping', () => {
  it('escapes every character TeX would otherwise read as syntax', () => {
    expect(escapeLatex('val_loss & 50% of $x #1 {a} ~b ^c')).toBe(
      'val\\_loss \\& 50\\% of \\$x \\#1 \\{a\\} \\textasciitilde{}b \\textasciicircum{}c'
    );
  });

  it('does not escape the backslashes it just introduced', () => {
    // A chain of replaces does exactly that: escaping `\` and then `&` leaves
    // the second pass' output alone, but the other order double-escapes the
    // first pass'. One regex cannot re-visit what it wrote.
    expect(escapeLatex('a & b')).toBe('a \\& b');
    expect(escapeLatex('100\\%')).toBe('100\\textbackslash{}\\%');
  });
});

describe('inline markdown', () => {
  it.each([
    ['**bold**', '\\textbf{bold}'],
    ['*emphasis*', '\\emph{emphasis}'],
    ['_emphasis_', '\\emph{emphasis}'],
    ['`val_loss`', '\\texttt{val\\_loss}']
  ])('renders %s', (markdown, latex) => {
    expect(inlineToLatex(markdown)).toBe(latex);
  });

  it('escapes inside the markup as well as outside it', () => {
    // The underscore in a metric name is the common case, and an unescaped one
    // inside \texttt is still a subscript that fails to compile.
    expect(inlineToLatex('best `val_mean_iou` so far & done')).toBe(
      'best \\texttt{val\\_mean\\_iou} so far \\& done'
    );
  });

  it('leaves an underscore that is not emphasis alone', () => {
    expect(inlineToLatex('val_loss and train_loss')).toBe('val\\_loss and train\\_loss');
  });
});

describe('block markdown', () => {
  it('turns bullets into an itemize and numbers into an enumerate', () => {
    const tex = markdownToLatex('- one\n- two\n\n1. first\n2. second');

    expect(tex).toContain('\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}');
    expect(tex).toContain('\\begin{enumerate}\n  \\item first\n  \\item second\n\\end{enumerate}');
  });

  it('closes a list when prose follows it', () => {
    // An unclosed environment is a compile error at the end of the document,
    // reported nowhere near the finding that caused it.
    const tex = markdownToLatex('- one\n\nAnd then prose.');

    expect(tex.indexOf('\\end{itemize}')).toBeLessThan(tex.indexOf('And then prose.'));
  });

  it('keeps paragraphs apart and collapses extra blank lines', () => {
    expect(markdownToLatex('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('renders a heading as a subsubsection, below the section the finding becomes', () => {
    expect(markdownToLatex('## Setup')).toBe('\\subsubsection{Setup}');
  });
});

describe('choosing which epoch each run is reported at', () => {
  const runs = [
    run('window16', [
      [0, { val: { mean_iou: 0.01, loss: 1.1 } }],
      [185, { val: { mean_iou: 0.4579, loss: 1.0566 } }],
      [199, { val: { mean_iou: 0.4569, loss: 1.0479 } }]
    ])
  ];

  it('reports the best epoch by the named metric, not the last one', () => {
    // The whole reason `selectBy` exists. Reported on its final epoch this run
    // shows 0.4569; its best checkpoint — the one anyone would ship and cite —
    // is 0.4579 at epoch 185.
    const tex = findingToLatex(finding(), runs, { selectBy: 'val.mean_iou', direction: 'max' });

    expect(tex).toContain('window16 & 185 & 1.0566 & 0.4579');
    expect(tex).toContain('epoch with its highest \\texttt{val.mean\\_iou}');
  });

  it('takes the lowest when that is the better end', () => {
    const tex = findingToLatex(finding(), runs, { selectBy: 'val.loss', direction: 'min' });

    expect(tex).toContain('window16 & 199 &');
    expect(tex).toContain('epoch with its lowest');
  });

  it('falls back to the final epoch, and the caption says so', () => {
    // Never silently: "best epoch" and "final epoch" are different claims about
    // the same run, and a table that does not say which is unreproducible.
    const tex = findingToLatex(finding(), runs, {});

    expect(tex).toContain('window16 & 199 &');
    expect(tex).toContain('each at its final recorded epoch');
  });

  it('reports one epoch per run rather than each metric at its own best', () => {
    // A row assembled from several epochs describes a checkpoint that never
    // existed, which is worse than a modest number.
    const tex = findingToLatex(finding(), runs, { selectBy: 'val.mean_iou', direction: 'max' });

    expect(tex).toContain('0.4579');
    // 1.0479 is the lowest val.loss, but it belongs to epoch 199, not 185.
    expect(tex).not.toContain('1.0479');
  });
});

describe('the table', () => {
  it('reads only the shallowest metrics, not the per-class breakdown', () => {
    const tex = findingToLatex(
      finding(),
      [run('a', [[1, { val: { loss: 0.5, vehicle: { iou: 0.9 } } }]])],
      {}
    );

    expect(tex).toContain('\\texttt{val.loss}');
    expect(tex).not.toContain('vehicle');
  });

  it('leaves out machine telemetry', () => {
    const tex = findingToLatex(
      finding(),
      [run('a', [[1, { loss: 0.5, system_info: { gpu_load: 91 } }]])],
      {}
    );

    expect(tex).not.toContain('gpu_load');
  });

  it('honours an explicit column order and caps how wide the table gets', () => {
    const wide = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`m${i}`, i / 10]));
    const tex = findingToLatex(finding(), [run('a', [[1, wide]])], {});

    // Six columns plus Run and Epoch; more than that runs off a page.
    expect(tex).toContain('\\begin{tabular}{lrrrrrrr}');
    expect(tex).toContain('\\texttt{m5}');
    expect(tex).not.toContain('\\texttt{m6}');
  });

  it('marks a metric one run recorded and another did not', () => {
    const tex = findingToLatex(
      finding(),
      [run('a', [[1, { loss: 0.5, extra: 1 }]]), run('b', [[1, { loss: 0.6 }]])],
      {}
    );

    expect(tex).toContain('b & 1 & -- & 0.6');
  });

  it('omits the table entirely for a finding with no usable runs', () => {
    // A finding can be a note with nothing measured behind it; an empty tabular
    // is a compile error, not an empty table.
    const tex = findingToLatex(finding(), [run('a', [])], {});

    expect(tex).not.toContain('\\begin{table}');
    expect(tex).toContain('\\subsection{');
  });
});

describe('the section as a whole', () => {
  it('names the packages it needs rather than assuming them', () => {
    // \toprule failing to compile says nothing about where it came from.
    expect(findingToLatex(finding(), [], {})).toContain('% Requires: \\usepackage{booktabs}');
  });

  it('carries no preamble, because it is meant to be input into a paper', () => {
    expect(findingToLatex(finding(), [], {})).not.toContain('\\documentclass');
  });

  it('says who wrote it, and whether that was software', () => {
    expect(findingToLatex(finding(), [], {})).toContain('% by assistant: Claude');
    expect(findingToLatex(finding({ authorKind: 'person', authorLabel: 'Toomas' }), [], {})).toContain(
      '% by author: Toomas'
    );
  });

  it('comments out the next-run suggestion instead of printing it', () => {
    // A reviewer reading "try a smaller window" in a results section is reading
    // something never meant for them.
    const tex = findingToLatex(finding({ recommendations: 'Drop window24 from the sweep.' }), [], {});

    expect(tex).toContain('% Drop window24 from the sweep.');
    expect(tex).not.toMatch(/^Drop window24/m);
  });

  it('leaves the suggestion block out when there is none', () => {
    expect(findingToLatex(finding(), [], {})).not.toContain('Suggested next run');
  });
});

describe('epochMetrics', () => {
  it('flattens a nested result to dotted paths', () => {
    expect([...epochMetrics({ val: { loss: 0.5 }, train: { loss: 0.1 } })]).toEqual([
      ['val.loss', 0.5],
      ['train.loss', 0.1]
    ]);
  });

  it('ignores a value that is not a finite number', () => {
    // NaN reaches a table as "NaN" and a reader has no way to tell it from a
    // measurement.
    expect([...epochMetrics({ loss: NaN, ok: 1, note: 'text' })]).toEqual([['ok', 1]]);
  });
});
