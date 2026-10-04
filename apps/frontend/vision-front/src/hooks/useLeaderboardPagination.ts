import { useSearchParams } from 'react-router-dom';

/**
 * Keep page navigation in the URL, including the independent list of unranked checkpoints and whether only
 * results with observed evidence are ranked. Changing the filter returns to the first page, since the ranks change.
 */
export const useLeaderboardPagination = () => {
  const [params, setParams] = useSearchParams();
  const read = (key: string) => {
    const value = Number(params.get(key));
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  };
  return {
    page: read('page'),
    unrankedPage: read('unrankedPage'),
    observed: params.get('evidence') === 'observed',
    setObserved: (on: boolean) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('page');
        next.delete('unrankedPage');
        if (on) next.set('evidence', 'observed');
        else next.delete('evidence');
        return next;
      });
    },
    setPage: (page: number, key = 'page') => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, String(page));
        return next;
      });
    }
  };
};
