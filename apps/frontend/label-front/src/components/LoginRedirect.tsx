import { createLoginRedirect } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

/** `/jobs` is label-front's default route — it has no `/account` route. */
const LoginRedirect = createLoginRedirect(useAuth, { redirectTo: '/jobs' });

export default LoginRedirect;
