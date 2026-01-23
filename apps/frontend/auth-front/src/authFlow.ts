import { getGlobalConfig } from './config/ConfigProvider';

declare global {
  interface Window {
    google: any;
    googleScriptLoaded?: boolean;
  }
}

function handleCredentialResponse(response: { credential: string }, redirectUri: string) {
  const idToken = response.credential;
  const config = getGlobalConfig();

  console.log('Sending token to auth service:', config.AUTH_SERVICE_URL);

  fetch(`${config.AUTH_SERVICE_URL}/auth/validate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idToken }),
    credentials: 'include' // Include cookies in the request
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      console.log('Auth service response:', data);
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

export function initializeGoogleSignIn(clientId: string, redirectUri: string) {
  console.log('Starting Google Sign-In initialization...');
  console.log('Client ID:', clientId);
  console.log('Redirect URI:', redirectUri);

  let retryCount = 0;
  const maxRetries = 100; // Wait up to 10 seconds
  let googleInitialized = false;
  const renderGoogleButton = () => {
    const buttonElement = document.getElementById('google-signin-button');
    if (!buttonElement) {
      console.log('Button element not found yet');
      return false;
    }

    // Check if Google button is already rendered (look for Google's button class)
    if (
      buttonElement.querySelector('[data-testid="google-signin-button"]') ||
      buttonElement.querySelector('div[role="button"]') ||
      buttonElement.innerHTML.includes('Sign in with Google')
    ) {
      console.log('Google button already rendered');
      return true;
    }

    console.log('Found button element, rendering Google button...');
    try {
      // Clear any existing content first
      buttonElement.innerHTML = '';

      window.google.accounts.id.renderButton(buttonElement, { theme: 'outline', size: 'large' });
      console.log('Google Sign-In button rendered successfully');
      return true;
    } catch (error) {
      console.error('Error rendering Google Sign-In button:', error);
      return false;
    }
  };
  const initializeGoogle = () => {
    retryCount++;
    console.log(`Attempt ${retryCount}: Checking for Google Sign-In...`);
    console.log('- Google object:', !!window.google);
    console.log('- Google script loaded flag:', window.googleScriptLoaded);
    console.log('- Google accounts:', !!(window.google && window.google.accounts));
    console.log('- Google accounts.id:', !!(window.google && window.google.accounts && window.google.accounts.id));

    // Check if Google Sign-In library is loaded
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retryCount < maxRetries) {
        console.log('Google Sign-In library not ready yet, retrying...');
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
      console.log('Google Sign-In library loaded successfully, initializing...');
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => handleCredentialResponse(response, redirectUri)
        });
        console.log('Google Sign-In initialized');
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
      console.log('Button not rendered yet, retrying...');
      setTimeout(initializeGoogle, 100);
    } else if (!buttonRendered) {
      console.error('Failed to render Google Sign-In button after maximum retries');
      showFallbackMessage();
    }
  };

  const showFallbackMessage = () => {
    const buttonElement = document.getElementById('google-signin-button');
    if (buttonElement && !buttonElement.hasChildNodes()) {
      buttonElement.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #d32f2f; border: 1px solid #ddd; border-radius: 4px;">
          <p style="margin: 0 0 10px 0;">⚠️ Google Sign-In failed to load</p>
          <p style="margin: 0 0 15px 0; font-size: 0.9rem; color: #666;">
            This might be due to network issues or browser extensions blocking Google services.
          </p>
          <button onclick="window.location.reload()" style="padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
            Reload Page
          </button>
          <button onclick="window.open('${redirectUri}', '_self')" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Skip Login
          </button>
        </div>
      `;
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
