/** Fewer characters than this match nearly everything; the service refuses them too. */
export const MIN_SEARCH = 2;
/** A pause in typing before the search runs, so one is not made per keystroke. */
export const SEARCH_DELAY_MS = 350;
/** The service sends this many a page; fewer means there is no older page. */
export const SEARCH_PAGE = 30;
