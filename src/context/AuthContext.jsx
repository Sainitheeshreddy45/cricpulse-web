import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AUTH_TOKEN_KEY } from '../api';
import { authService } from '../services/authService';
import { AUTH_USER_KEY, unwrapUser, withLocalAccountKey } from '../utils/authSession';
import { AuthContext } from './authContextValue';

let currentUserRequest;

function getCurrentUserOnce() {
  if (!currentUserRequest) {
    currentUserRequest = authService.getCurrentUser().finally(() => {
      currentUserRequest = null;
    });
  }
  return currentUserRequest;
}

export function AuthProvider({ children }) {
  const sessionVersion = useRef(0);
  const [user, setUser] = useState(() => {
    try {
      const cached = JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || 'null');
      const restored = withLocalAccountKey(cached);
      if (restored) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(restored));
      return restored;
    } catch {
      window.localStorage.removeItem(AUTH_USER_KEY);
      return null;
    }
  });

  useEffect(() => {
    let active = true;
    const version = sessionVersion.current;
    if (window.localStorage.getItem(AUTH_TOKEN_KEY)) {
      getCurrentUserOnce().then((response) => {
        if (active && version === sessionVersion.current) {
          const account = unwrapUser(response);
          const cached = JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || 'null');
          const restored = withLocalAccountKey(cached ? { ...account, ...cached } : account);
          setUser(restored);
          window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(restored));
        }
      }).catch((error) => {
        // A temporary network/API failure must not turn a refresh into a logout.
        if (active && version === sessionVersion.current && [401, 403].includes(error.status)) {
          window.localStorage.removeItem(AUTH_TOKEN_KEY);
          window.localStorage.removeItem(AUTH_USER_KEY);
          setUser(null);
        }
      });
    } else {
      window.localStorage.removeItem(AUTH_USER_KEY);
      // oxlint-disable react/set-state-in-effect
      setUser(null);
      // oxlint-enable react/set-state-in-effect
    }
    return () => { active = false; };
  }, []);

  const signIn = useCallback((account) => {
    sessionVersion.current += 1;
    const normalized = withLocalAccountKey(unwrapUser(account));
    setUser(normalized);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalized));
  }, []);

  const signOut = useCallback(() => {
    sessionVersion.current += 1;
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((current) => {
      const updated = { ...current, ...updates };
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut, updateUser }), [user, signIn, signOut, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
