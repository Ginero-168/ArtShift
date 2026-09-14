"use client";

import { useEffect, useState } from "react";

export type AuthUser = {
  id: string;
  provider: "google";
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: number;
};

type AuthResponse = {
  authenticated?: boolean;
  user?: AuthUser | null;
  error?: string;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const data = (await response.json()) as AuthResponse;
      if (response.ok && data.authenticated && data.user) {
        setUser(data.user);
        setAuthenticated(true);
        setError(null);
      } else {
        setUser(null);
        setAuthenticated(false);
      }
    } catch (err) {
      setUser(null);
      setAuthenticated(false);
      setError(err instanceof Error ? err.message : "Failed to verify session");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  function signInWithGoogle() {
    window.location.assign("/api/auth/google/start");
  }

  async function signOut(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
    } finally {
      setUser(null);
      setAuthenticated(false);
      window.location.assign("/");
    }
  }

  return {
    user,
    authenticated,
    loading,
    error,
    signInWithGoogle,
    signOut,
    checkSession,
  };
}
