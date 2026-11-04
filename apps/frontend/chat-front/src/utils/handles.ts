export const handlesOf = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((handle) => handle.trim().replace(/^@/, ''))
    .filter(Boolean);
