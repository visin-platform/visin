/**
 * A small flat badge, in the style README badges have: a grey label and a coloured message. Text widths are an
 * estimate (the badge is drawn without measuring a font), which is good enough for a short label and message.
 */
const CHARACTER_WIDTH = 6.3;
const PADDING = 10;
const HEIGHT = 20;

const escapeXml = (text: string): string =>
  text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string);

const widthOf = (text: string): number => Math.round(text.length * CHARACTER_WIDTH) + PADDING;

export function renderBadge(label: string, message: string, color = '#007ec6'): string {
  const left = widthOf(label);
  const right = widthOf(message);
  const total = left + right;
  const words = `${label}: ${message}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" role="img" aria-label="${escapeXml(words)}">`,
    `<title>${escapeXml(words)}</title>`,
    '<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>',
    `<clipPath id="r"><rect width="${total}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>`,
    '<g clip-path="url(#r)">',
    `<rect width="${left}" height="${HEIGHT}" fill="#555"/>`,
    `<rect x="${left}" width="${right}" height="${HEIGHT}" fill="${escapeXml(color)}"/>`,
    `<rect width="${total}" height="${HEIGHT}" fill="url(#s)"/>`,
    '</g>',
    '<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">',
    `<text x="${left / 2}" y="14">${escapeXml(label)}</text>`,
    `<text x="${left + right / 2}" y="14">${escapeXml(message)}</text>`,
    '</g>',
    '</svg>',
    ''
  ].join('\n');
}
