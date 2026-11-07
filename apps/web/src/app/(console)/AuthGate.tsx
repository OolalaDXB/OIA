"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "../../lib/supabase";

/**
 * The login, and the honest statement of what it does and does not protect.
 *
 * Two layers now exist: Vercel Authentication in front of the whole site, and
 * this one in front of the data. The second is not redundant — the console
 * ships its database key in a public bundle, so without a session the database
 * itself must refuse to answer. Row level security enforces that server-side;
 * this screen is only the way to obtain a session.
 *
 * When no database is configured the gate steps aside entirely: the console
 * runs on its bundled snapshot exactly as it did before.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "UNCONFIGURED" || state.status === "SIGNED_IN") return <>{children}</>;

  if (state.status === "LOADING") {
    return (
      <div className="gate">
        <div className="gateCard muted">Checking your session…</div>
      </div>
    );
  }

  return (
    <div className="gate">
      <form
        className="gateCard"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const result = await signIn(email.trim(), password);
          setBusy(false);
          setError(result.error);
        }}
      >
        <div className="railBrand gateBrand">OIA</div>
        <h1>Sign in</h1>
        <p className="muted small">
          The watch database holds which calls the studio is chasing, and for which project. That is internal, so
          it answers only to an authenticated session — the console&apos;s public key alone gets nothing.
        </p>
        <label className="gateField">
          <span className="muted">Email</span>
          <input
            className="comment inputLine"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="gateField">
          <span className="muted">Password</span>
          <input
            className="comment inputLine"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn on gateBtn" type="submit" disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>
        {error && <div className="warn small">{error}</div>}
        <div className="muted small gateFoot">
          No account yet? It is created once, in the Supabase dashboard under Authentication → Users. There is no
          public sign-up on purpose.
        </div>
      </form>
    </div>
  );
}
