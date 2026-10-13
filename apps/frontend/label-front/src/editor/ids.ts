/** An id for a new box. The server only needs it unique within a frame and stable across edits. */
export const newBoxId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `box-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
