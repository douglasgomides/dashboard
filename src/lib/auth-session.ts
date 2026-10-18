import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
}

export const INITIAL_AUTH_STATE: AuthState = { user: null, session: null, loading: true, isAdmin: false };

/** Discards permissions from an older session and clears data before changing identities. */
export function createAuthSessionController({
  fetchIsAdmin,
  clearCache,
  publish,
}: {
  fetchIsAdmin: () => Promise<boolean>;
  clearCache: () => void;
  publish: (state: AuthState) => void;
}) {
  let disposed = false;
  let revision = 0;
  let identity: string | null | undefined;
  let state = INITIAL_AUTH_STATE;

  return {
    accept(session: Session | null) {
      if (disposed) return;
      const currentRevision = ++revision;
      const user = session?.user ?? null;
      const changed = identity !== (user?.id ?? null);
      // null and undefined deliberately differ on first initialization.
      if (identity !== (user?.id ?? null)) clearCache();
      identity = user?.id ?? null;
      state = { user, session, loading: !!user && (changed || state.loading), isAdmin: changed ? false : state.isAdmin };
      if (!user) state = { ...state, loading: false, isAdmin: false };
      publish(state);
      if (!user) return;

      // Auth notifications must return promptly. Resolve permissions outside the
      // notification, and never publish a result belonging to a previous session.
      setTimeout(() => {
        if (disposed || revision !== currentRevision) return;
        void Promise.resolve().then(fetchIsAdmin).catch(() => false).then((isAdmin) => {
          if (disposed || revision !== currentRevision) return;
          // A revoked role must also discard data read with the old permissions.
          if (state.isAdmin !== (isAdmin === true)) clearCache();
          state = { user, session, loading: false, isAdmin: isAdmin === true };
          publish(state);
        });
      }, 0);
    },
    dispose() {
      disposed = true;
      revision += 1;
    },
  };
}

/** Only same-origin, absolute application paths are valid login return URLs. */
export function safeLoginRedirect(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /^\/[/\\]/.test(value) || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith("//") || /^\/login(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
