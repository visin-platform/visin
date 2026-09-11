import { getGlobalConfig } from './config/ConfigProvider';

// Minimal shape of the Google Identity Services SDK (loaded via external <script>,
// not installed as an npm package) covering only what this file calls.
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: { theme?: string; size?: string }) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
    googleScriptLoaded?: boolean;
  }
}

function handleCredentialResponse(response: { credential: string }, redirectUri: string) {
  const idToken = response.credential;
  const config = getGlobalConfig();

  fetch(`${config.AUTH_SERVICE_URL}/auth/validate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idToken }),
    credentials: 'include' // Include cookies in the request
  })
    .then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      if (data.success) {
        window.location.href = redirectUri; // Redirect back without JWT
      } else {
        console.error('Validation failed:', data.message);
        // Redirect back to auth-front with error
        const authFrontUrl = window.location.origin;
        const errorParam = encodeURIComponent(data.message || 'Authentication failed');
        window.location.href = `${authFrontUrl}?error=${errorParam}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      }
    })
    .catch((err) => {
      console.error('Error:', err);
      const authFrontUrl = window.location.origin;
      const errorParam = encodeURIComponent('Authentication error: ' + err.message);
      window.location.href = `${authFrontUrl}?error=${errorParam}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    });
}

export function initializeGoogleSignIn(clientId: string, redirectUri: string, onCredential?: (response: { credential: string }) => void) {
  let retryCount = 0;
  const maxRetries = 100; // Wait up to 10 seconds
  let googleInitialized = false;
  const renderGoogleButton = () => {
    const buttonElement = document.getElementById('google-signin-button');
    if (!buttonElement) {
      return false;
    }

    // Check if Google button is already rendered (look for Google's button class)
    if (
      buttonElement.querySelector('[data-testid="google-signin-button"]') ||
      buttonElement.querySelector('div[role="button"]') ||
      buttonElement.innerHTML.includes('Sign in with Google')
    ) {
      return true;
    }

    try {
      // Clear any existing content first
      buttonElement.innerHTML = '';

      // renderGoogleButton is only called after initializeGoogle's guard confirms
      // window.google.accounts.id is loaded.
      window.google!.accounts.id.renderButton(buttonElement, { theme: 'outline', size: 'large' });
      return true;
    } catch (error) {
      console.error('Error rendering Google Sign-In button:', error);
      return false;
    }
  };
  const initializeGoogle = () => {
    retryCount++;

    // Check if Google Sign-In library is loaded
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retryCount < maxRetries) {
        setTimeout(initializeGoogle, 100);
        return;
      } else {
        console.error('Google Sign-In library failed to load after maximum retries');
        showFallbackMessage();
        return;
      }
    }

    // Initialize Google Sign-In if not already done
    if (!googleInitialized) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: onCredential || ((response: { credential: string }) => handleCredentialResponse(response, redirectUri))
        });
        googleInitialized = true;
      } catch (error) {
        console.error('Error during Google Sign-In initialization:', error);
        showFallbackMessage();
        return;
      }
    }

    // Try to render the button
    const buttonRendered = renderGoogleButton();

    if (!buttonRendered && retryCount < maxRetries) {
      setTimeout(initializeGoogle, 100);
    } else if (!buttonRendered) {
      console.error('Failed to render Google Sign-In button after maximum retries');
      showFallbackMessage();
    }
  };

  const showFallbackMessage = () => {
    const buttonElement = document.getElementById('google-signin-button');
    if (buttonElement && !buttonElement.hasChildNodes()) {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'padding: 20px; text-align: center; color: #d32f2f; border: 1px solid #ddd; border-radius: 4px;';

      const title = document.createElement('p');
      title.style.cssText = 'margin: 0 0 10px 0;';
      title.textContent = 'Google Sign-In failed to load';

      const description = document.createElement('p');
      description.style.cssText = 'margin: 0 0 15px 0; font-size: 0.9rem; color: #666;';
      description.textContent = 'This might be due to network issues or browser extensions blocking Google services.';

      const reloadButton = document.createElement('button');
      reloadButton.type = 'button';
      reloadButton.style.cssText = 'padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
      reloadButton.textContent = 'Reload Page';
      reloadButton.addEventListener('click', () => window.location.reload());

      const skipButton = document.createElement('button');
      skipButton.type = 'button';
      skipButton.style.cssText = 'padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;';
      skipButton.textContent = 'Skip Login';
      skipButton.addEventListener('click', () => {
        window.location.href = redirectUri;
      });

      fallback.append(title, description, reloadButton, skipButton);
      buttonElement.append(fallback);
    }
  };

  // Use multiple strategies to ensure initialization happens

  // Strategy 1: Start immediately
  setTimeout(initializeGoogle, 0);

  // Strategy 2: Wait for DOM to be fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeGoogle, 100);
    });
  } else {
    setTimeout(initializeGoogle, 100);
  }

  // Strategy 3: Wait a bit longer in case of slow loading
  setTimeout(initializeGoogle, 500);
  setTimeout(initializeGoogle, 1000);
}
