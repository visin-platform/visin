import { createLoginRedirect } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

/** `/projects` is where the shell's `/` lands too. */
const LoginRedirect = createLoginRedirect(useAuth, { redirectTo: '/projects' });

export default LoginRedirect;
