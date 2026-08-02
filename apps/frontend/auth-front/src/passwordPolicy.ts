/**
 * Mirrors MIN_PASSWORD_LENGTH in auth-service's passwordService. Kept in step by
 * hand: the fronts have no build-time access to the services, and the server
 * remains the authority — this only drives the hint and the disabled state.
 */
export const MIN_PASSWORD_LENGTH = 10;
