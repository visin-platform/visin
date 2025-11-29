import { useEffect } from 'react';

/**
 * Custom hook to set the document title
 * @param title - The title to set for the page
 */
export const usePageTitle = (title: string) => {
  useEffect(() => {
    document.title = title;
  }, [title]);
};