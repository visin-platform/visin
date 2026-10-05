import { createContext, useContext } from 'react';

/**
 * Whether these pages run inside shell-front rather than on their own. Inside it, a person's public page
 * (`/u/:handle`) is a route of the same router; standalone, it lives on another app this one has no address for, so
 * a name is then shown without the link.
 */
export const EmbeddedContext = createContext(false);

export const useEmbedded = (): boolean => useContext(EmbeddedContext);
