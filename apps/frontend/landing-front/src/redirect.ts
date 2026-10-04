/** A full navigation away from this site. Its own module so a test can see where it was asked to go. */
export const redirectTo = (url: string): void => window.location.replace(url);
