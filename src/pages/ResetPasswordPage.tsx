import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function getHashRouteQueryParam(name: string): string | null {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;
  const search = hash.slice(qIndex + 1);
  return new URLSearchParams(search).get(name);
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [errorText, setErrorText] = useState("");

  const nav = useNavigate();

  const tokenHash = useMemo(() => {
    // Works for HashRouter URLs like /#/reset-password?token_hash=...&type=recovery
    // and also for normal query URLs if you switch routers later.
    return (
      getHashRouteQueryParam("token_hash") ||
      new URLSearchParams(window.location.search).get("token_hash")
    );
  }, []);

  const type = useMemo(() => {
    return (
      getHashRouteQueryParam("type") ||
      new URLSearchParams(window.location.search).get("type")
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setChecked(false);
      setErrorText("");

      // Preferred path: explicit token verification from the email link
      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (cancelled) return;

        if (error) {
          setRecoveryReady(false);
          setErrorText("This password reset link is invalid or has expired.");
          setChecked(true);
          return;
        }

        setRecoveryReady(true);
        setChecked(true);
        return;
      }

      // Fallback: if a recovery session already exists
      const { data } = await supabase.auth.getSession();

      if (cancelled) return;

      if (data.session) {
        setRecoveryReady(true);
      } else {
        setRecoveryReady(false);
        setErrorText("This password reset link is invalid or has expired.");
      }
      setChecked(true);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [tokenHash, type]);

  async function updatePassword() {
    if (!recoveryReady) {
      alert("This password reset link is not valid or has expired.");
      return;
    }
    if (!password) return alert("Enter a new password.");
    if (password.length < 6) return alert("Password should be at least 6 characters.");
    if (password !== password2) return alert("Passwords do not match.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      alert("Update password error: " + error.message);
      return;
    }

    alert("Password updated successfully. Please log in.");
    nav("/login", { replace: true });
  }

  if (!checked) {
    return <div>Checking reset link…</div>;
  }

  if (!recoveryReady) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Reset password</div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {errorText || "This password reset link is invalid or has expired."}
        </div>
        <div style={{ fontSize: 13 }}>
          Request a new one at <Link to="/forgot-password">Forgot password</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Set a new password</div>

      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>New password</div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="new password"
          type="password"
          style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Confirm new password</div>
        <input
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="repeat new password"
          type="password"
          style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />
      </label>

      <button type="button" onClick={updatePassword} disabled={busy} style={{ height: 40, borderRadius: 10 }}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </div>
  );
}