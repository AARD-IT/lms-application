import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/client';
import { checkSession, getMe, setAuthToken, setUnauthorizedHandler, updateMe } from '../api/client';

/**
 * Single source of truth for "who is signed in".
 *
 * Real, database-backed authentication using JWT tokens and active device session tracking.
 * All authentication decisions, roles, and course accesses are verified by the backend.
 */

const STORAGE_KEY = 'lms.session';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private browsing — the session simply won't survive a reload */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession());
  const [initialising, setInitialising] = useState(true);

  // Re-hydrate on boot: re-attach the token and refresh the student record.
  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setInitialising(false);
      return;
    }

    setAuthToken(stored.token);
    getMe()
      .then((student) => {
        // The server is the source of truth for the profile, role and status.
        const next = { ...stored, student: { ...stored.student, ...student } };
        setSession(next);
        writeStoredSession(next);
      })
      .catch((err) => {
        // A 401 here means the stored token is expired or no longer valid.
        // Keeping it would leave the app half-signed-in: public endpoints
        // answer, authenticated pages fail. Anything else (offline, 5xx) is
        // worth riding out with the session intact.
        if (err?.response?.status === 401) {
          setAuthToken(null);
          setSession(null);
          writeStoredSession(null);
        }
      })
      .finally(() => setInitialising(false));
  }, []);

  const establish = useCallback((student, token = null) => {
    const next = { student, token };
    setAuthToken(token);
    setSession(next);
    writeStoredSession(next);
    return next;
  }, []);

  const signIn = useCallback(
    async ({ email, password, remember = true }) => {
      const data = await authApi.login({ email, password });
      const next = establish(data.student ?? data.user ?? data, data.token);
      if (!remember) writeStoredSession(null);
      return next.student;
    },
    [establish]
  );

  const activateWithPin = useCallback(
    async ({ email, pin, deviceId, deviceInfo, remember = true }) => {
      const data = await authApi.activateDevice({
        email,
        pin,
        deviceId: deviceId || authApi.getOrCreateDeviceId(),
        deviceInfo,
      });
      const next = establish(data.student ?? data.user, data.token);
      if (!remember) writeStoredSession(null);
      return data;
    },
    [establish]
  );

  const signUp = useCallback(
    async ({ firstName, lastName, email, password, phone }) => {
      const name = `${firstName} ${lastName}`.trim();
      const data = await authApi.register({ firstName, lastName, name, email, password, phone });
      return establish(data.student ?? data.user ?? data, data.token).student;
    },
    [establish]
  );

  const signOut = useCallback(() => {
    authApi.logout().catch(() => {});
    setAuthToken(null);
    setSession(null);
    writeStoredSession(null);
  }, []);

  /**
   * Called when a session is invalidated because the user logged in on another device/browser.
   * Clears all local auth tokens and session state, saves the message, and redirects to login.
   */
  const terminateSession = useCallback((reason) => {
    const message =
      (typeof reason === 'string' ? reason : reason?.error) ||
      'You have been logged out because your account was logged in on another device.';

    try {
      sessionStorage.setItem('lms.session_terminated_message', message);
    } catch {
      // ignore in restricted environments
    }

    setAuthToken(null);
    setSession(null);
    writeStoredSession(null);

    // If currently on an authenticated page (or any non-login page), redirect immediately
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?reason=session_terminated';
    }
  }, []);

  /**
   * Any 401 from an authenticated request clears the session. If the rejection
   * was due to single-device login termination, trigger the full termination flow.
   */
  useEffect(() => {
    setUnauthorizedHandler((errorData) => {
      const isTerminated =
        errorData?.code === 'SESSION_TERMINATED' ||
        (typeof errorData?.error === 'string' &&
          errorData.error.toLowerCase().includes('another device'));

      if (isTerminated) {
        terminateSession(errorData?.error);
      } else {
        setAuthToken(null);
        setSession(null);
        writeStoredSession(null);
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [terminateSession]);

  /**
   * Fallback session validation mechanism:
   * Periodically checks session validity and checks when tab visibility returns.
   * If another device logged in while this device was idle or disconnected,
   * this immediately detects the invalidated session and triggers logout.
   */
  useEffect(() => {
    if (!session?.token) return;

    const validateActiveSession = async () => {
      try {
        await checkSession();
      } catch (err) {
        // Any 401 response is handled by the response interceptor and onUnauthorized
      }
    };

    // Check when user returns to this browser tab/window
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        validateActiveSession();
      }
    };

    // Heartbeat check every 30 seconds
    const interval = setInterval(validateActiveSession, 30000);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
    };
  }, [session?.token]);

  /** Saves profile fields to the server and keeps the session in step. */
  const updateProfile = useCallback(async (patch) => {
    const saved = await updateMe(patch);
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, student: { ...prev.student, ...saved } };
      writeStoredSession(next);
      return next;
    });
    return saved;
  }, []);

  /** Completes learner onboarding personal details and sets profileCompleted = true. */
  const submitProfileCompletion = useCallback(async (profileData) => {
    const data = await authApi.completeProfile(profileData);
    const updatedStudent = data.student ?? data.user ?? data;
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, student: { ...prev.student, ...updatedStudent } };
      writeStoredSession(next);
      return next;
    });
    return updatedStudent;
  }, []);

  /** A password change revokes older tokens; this swaps in the fresh one. */
  const replaceToken = useCallback((token) => {
    setAuthToken(token);
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, token };
      writeStoredSession(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      student: session?.student ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.student),
      initialising,
      signIn,
      activateWithPin,
      signUp,
      signOut,
      terminateSession,
      updateProfile,
      submitProfileCompletion,
      replaceToken,
      isAdmin: session?.student?.role === 'admin',
      isSuperAdmin: session?.student?.role === 'admin' && (session?.student?.adminRole || 'super_admin') === 'super_admin',
    }),
    [session, initialising, signIn, activateWithPin, signUp, signOut, terminateSession, updateProfile, submitProfileCompletion, replaceToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Convenience accessor for components that only render the student.
 * Falls back to a neutral placeholder so public pages can use it safely.
 */
export function useStudent() {
  const { student } = useAuth();
  return student ?? { id: null, name: 'Guest', email: '' };
}
