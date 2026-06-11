"use client";

/**
 * App-wide "who is using this app right now" identity.
 *
 * This is NOT authentication — it's a single attribution string the operator
 * sets once on first launch (or changes via the navbar). Every form (opp,
 * contacts, site tasks, future modules) reads it from this context and sends
 * it as created_by / updated_by / changed_by to the API. The server treats it
 * as opaque text.
 *
 * Persistence: localStorage on the user's machine, under one key. The first
 * launch pre-fills from the OS username via GET /api/system/username so the
 * common case is "confirm and go."
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import WelcomeIdentityModal from "@/components/identity/WelcomeIdentityModal";

interface Ctx {
  /** The current identity string. Empty string = unset. */
  currentUser: string;
  /** Update the identity (persisted to localStorage). */
  setCurrentUser: (name: string) => void;
  /** Clear the identity and re-prompt on next mount. Used by "החלף" button
   * paths that want to force the dialog open. */
  clearCurrentUser: () => void;
  /** Programmatically open the welcome modal — used by the navbar chip. */
  openSwitcher: () => void;
  /** True until we've checked localStorage; renders nothing during hydration
   * so SSR doesn't flash an empty string. */
  ready: boolean;
}

const LS_KEY = "app.current_user";

const CurrentUserContext = createContext<Ctx | null>(null);

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [osUsername, setOsUsername] = useState<string>("");
  // Avoid running the first-launch flow twice in React strict mode.
  const initRan = useRef(false);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    try {
      const stored = localStorage.getItem(LS_KEY) ?? "";
      if (stored.trim()) {
        setCurrentUserState(stored);
        setReady(true);
        return;
      }
    } catch { /* localStorage blocked, fall through */ }

    // First launch — fetch the OS username to pre-fill the welcome modal
    // and then open it.
    (async () => {
      try {
        const res = await fetch("/api/system/username");
        const j = await res.json();
        setOsUsername(j.username ?? "");
      } catch { setOsUsername(""); }
      setModalOpen(true);
      setReady(true);
    })();
  }, []);

  const setCurrentUser = useCallback((name: string) => {
    const v = name.trim();
    setCurrentUserState(v);
    try { localStorage.setItem(LS_KEY, v); } catch {}
  }, []);

  const clearCurrentUser = useCallback(() => {
    setCurrentUserState("");
    try { localStorage.removeItem(LS_KEY); } catch {}
  }, []);

  const openSwitcher = useCallback(() => setModalOpen(true), []);

  const value = useMemo(
    () => ({ currentUser, setCurrentUser, clearCurrentUser, openSwitcher, ready }),
    [currentUser, setCurrentUser, clearCurrentUser, openSwitcher, ready],
  );

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
      {modalOpen && (
        <WelcomeIdentityModal
          initialValue={currentUser || osUsername}
          isFirstLaunch={!currentUser}
          onSave={(name) => { setCurrentUser(name); setModalOpen(false); }}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </CurrentUserContext.Provider>
  );
}

/** Read the current identity. Throws if used outside the provider so a
 * missing wrap is caught at dev time, not silently dropped. */
export function useCurrentUser(): Ctx {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return ctx;
}
