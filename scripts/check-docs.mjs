#!/usr/bin/env node

// Check local Markdown/MDX links and README image paths without fetching the web.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const files = execFileSync('git', ['ls-files', '-z', '--', '*.md', '*.mdx'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const errors = [];

function slug(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

function anchors(file) {
  const counts = new Map();
  const result = new Set();
  for (const match of readFileSync(file, 'utf8').matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(match[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${count}`);
  }
  return result;
}

const anchorCache = new Map();
function checkLink(source, target, offset, fullText) {
  const value = target.replace(/^<|>$/g, '').replace(/&amp;/g, '&');
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(value)) return;
  const [pathname, fragment] = value.split('#', 2);
  const cleanPath = pathname.split('?', 1)[0];
  const destination = cleanPath ? resolve(dirname(source), decodeURIComponent(cleanPath)) : resolve(source);
  const line = fullText.slice(0, offset).split('\n').length;
  if (!existsSync(destination)) {
    errors.push(`${source}:${line}: missing local target ${value}`);
    return;
  }
  if (!fragment || !['.md', '.mdx'].includes(extname(destination)) || !statSync(destination).isFile()) return;
  if (!anchorCache.has(destination)) anchorCache.set(destination, anchors(destination));
  const anchor = decodeURIComponent(fragment).toLowerCase();
  if (!anchorCache.get(destination).has(anchor)) {
    errors.push(`${source}:${line}: missing heading #${fragment} in ${cleanPath || source}`);
  }
}

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  // Keep newlines and offsets intact while excluding examples in fenced code blocks.
  const readable = content.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, (match) => match.replace(/[^\n]/g, ' '));
  for (const match of readable.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)) {
    checkLink(file, match[1], match.index, content);
  }
  for (const match of readable.matchAll(/^\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)) {
    checkLink(file, match[1], match.index, content);
  }
  for (const match of readable.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    checkLink(file, match[1], match.index, content);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Checked local links in ${files.length} Markdown and MDX files.`);
}
