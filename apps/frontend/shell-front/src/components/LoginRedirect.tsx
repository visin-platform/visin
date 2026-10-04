import { createLoginRedirect } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

/** A signed-in session opens on the shell's home page. */
const LoginRedirect = createLoginRedirect(useAuth, { redirectTo: '/' });

export default LoginRedirect;
