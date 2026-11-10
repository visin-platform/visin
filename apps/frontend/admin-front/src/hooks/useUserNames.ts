import { useQuery } from '@tanstack/react-query';
import { admin } from '../services/admin';

interface Known {
  id: string;
  email: string;
  name: string;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;
const BATCH = 50;

/**
 * How to show a person in a report: their name and email rather than a 24-character id. Asks auth-service once for
 * every id on the page (ids that are not accounts, like a guest session, are left alone), and keeps the answer, since
 * who an id belongs to rarely changes. An id nobody answers for (a deleted account) is shown as itself, never as blank.
 */
export function useUserNames(ids: (string | undefined)[]): (id?: string) => string {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id) && OBJECT_ID.test(id!)))].sort();
  const known = useQuery({
    queryKey: ['admin-user-names', wanted.join(',')],
    queryFn: async () => {
      const rows: Known[] = [];
      for (let i = 0; i < wanted.length; i += BATCH)
        rows.push(...(await admin<Known[]>(`/users/lookup?ids=${wanted.slice(i, i + BATCH).join(',')}`)));
      return new Map(rows.map((row) => [row.id, row]));
    },
    enabled: wanted.length > 0,
    staleTime: 5 * 60_000
  });
  return (id) => {
    if (!id) return '';
    const person = known.data?.get(id);
    if (!person) return id;
    return person.name ? `${person.name} (${person.email})` : person.email;
  };
}
