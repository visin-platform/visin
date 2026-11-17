/**
 * A message as one line of plain text, for the list: the analyst writes Markdown, and `**Best run:` or a backtick
 * is noise in a preview. Removes the marks, keeps the words.
 */
export function plainPreview(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}
