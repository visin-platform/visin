import type { Message } from '../types/chat';

/** A thing Vivi read to write an answer, as a link the person can open to check it. */
export interface SourceLink {
  key: string;
  kind: 'run' | 'project' | 'dataset' | 'paper' | 'suite';
  href: string;
  /** For a paper: the pages that were read, as a reader counts them. */
  pages?: string;
}

const ID = /^[a-f\d]{24}$/i;
const id = (value: unknown): string | undefined => (typeof value === 'string' && ID.test(value) ? value : undefined);

/**
 * Everything an answer drew on that has a page of its own: runs, projects, datasets, papers (with the pages read) and
 * suites, taken from the reads recorded with it. Only a well-formed id becomes a link: a name or slug a model typed
 * is not an address.
 */
export function sourceLinks(message: Pick<Message, 'evidence'>): SourceLink[] {
  const found = new Map<string, SourceLink>();
  const add = (link: SourceLink) => {
    if (!found.has(link.key)) found.set(link.key, link);
  };
  const pages = new Map<string, Set<number>>();
  for (const { tool, input = {} } of message.evidence ?? []) {
    const training = id(input.training);
    if (training) add({ key: `run:${training}`, kind: 'run', href: `/trainings/${training}` });
    if (Array.isArray(input.trainings))
      for (const value of input.trainings) {
        const run = id(value);
        if (run) add({ key: `run:${run}`, kind: 'run', href: `/trainings/${run}` });
      }
    const project = id(input.project);
    if (project) add({ key: `project:${project}`, kind: 'project', href: `/projects/${project}` });
    const dataset = id(input.dataset);
    if (dataset) add({ key: `dataset:${dataset}`, kind: 'dataset', href: `/datasets/${dataset}` });
    const paper = id(input.paper);
    if (paper) {
      add({ key: `paper:${paper}`, kind: 'paper', href: `/papers/${paper}` });
      if (tool === 'read_paper_pages' && typeof input.from === 'number') {
        const read = pages.get(paper) ?? new Set<number>();
        const to = typeof input.to === 'number' ? input.to : input.from;
        for (let page = input.from; page <= Math.min(to, input.from + 20); page++) read.add(page);
        pages.set(paper, read);
      }
    }
    const suite = typeof input.suite === 'string' ? /^([A-Za-z0-9][A-Za-z0-9._-]{0,79})@(\d{1,6})$/.exec(input.suite) : null;
    if (suite) add({ key: `suite:${suite[1]}@${suite[2]}`, kind: 'suite', href: `/suites/${suite[1]}/${suite[2]}` });
  }
  return [...found.values()].map((link) => {
    const read = link.kind === 'paper' ? pages.get(link.key.slice('paper:'.length)) : undefined;
    return read?.size ? { ...link, pages: pageRanges([...read]) } : link;
  });
}

/** 3,4,5,9 as "3–5, 9". */
export function pageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (sorted[j + 1] === sorted[j] + 1) j++;
    ranges.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return ranges.join(', ');
}

/** The words on a source's chip. A run keeps the name it was asked about under; the rest say what they are. */
export function sourceLabel(link: SourceLink, runName?: string): string {
  const tail = link.key.split(':')[1];
  switch (link.kind) {
    case 'run':
      return runName || `Run ${tail.slice(-6)}`;
    case 'project':
      return `Project ${tail.slice(-6)}`;
    case 'dataset':
      return `Dataset ${tail.slice(-6)}`;
    case 'paper':
      return `Paper ${tail.slice(-6)}${link.pages ? `, p. ${link.pages}` : ''}`;
    case 'suite':
      return `Suite ${tail}`;
  }
}
