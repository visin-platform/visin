import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** A person in a report: their name (as `useUserNames` gives it), opening their account on the Users page. */
export default function PersonLink({ id, label }: { id: string; label: string }) {
  if (!OBJECT_ID.test(id)) return <>{label}</>;
  return (
    <Link component={RouterLink} to={`/users?open=${id}`} underline="hover">
      {label}
    </Link>
  );
}
