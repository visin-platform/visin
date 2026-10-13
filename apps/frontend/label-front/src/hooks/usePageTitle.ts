import { useEffect } from 'react';

/**
 * Names the browser tab for the page. A tab, a history entry and a bookmark are all the page's title, and a labeler
 * with a few jobs open needs to tell them apart.
 */
export const usePageTitle = (title: string): void => {
  useEffect(() => {
    document.title = title;
  }, [title]);
};
