import { createLoginRedirect } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

/** `/account` is account-front's default route. */
const LoginRedirect = createLoginRedirect(useAuth, { redirectTo: '/account' });

export default LoginRedirect;
