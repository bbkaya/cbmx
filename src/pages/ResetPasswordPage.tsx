import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function getHashRouteQueryParam(name: string): string | null {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;
  const search = hash.slice(qIndex + 1);
  return new URLSearchParams(search).get(name);
}

function getPostRouteHashParam(name: string): string | null {
  const hash = window.location.hash || "";
  const secondHashIndex = hash.indexOf("#", 1);
  if (secondHashIndex === -1) return null;
  const fragment = hash.slice(secondHashIndex + 1);
  return new URLSearchParams(fragment).get(name);
}

function getCombinedUrlParam(name: string): string | null {
  return (
    getPostRouteHashParam(name) ||
    getHashRouteQueryParam(name) ||
    new URLSearchParams(window.location.search).get(name) ||
    null
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isLockStolenError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? error ?? "").toLowerCase();
  const name = String((error as { name?: string } | null)?.name ?? "").toLowerCase();
  return (
    name.includes("aborterror") ||
    message.includes("lock was stolen by another request") ||
    message.includes("navigatorlock")
  );
}

function clearRecoveryParamsFromUrl() {
  const current = new URL(window.location.href);
  ["access_token", "refresh_token", "token_hash", "type", "expires_in", "expires_at"].forEach((key) => {
    current.searchParams.delete(key);
  });

  const hash = current.hash || "";
  const secondHashIndex = hash.indexOf("#", 1);
  if (secondHashIndex !== -1) {
    current.hash = hash.slice(0, secondHashIndex);
  } else {
    const qIndex = hash.indexOf("?");
    if (qIndex !== -1) current.hash = hash.slice(0, qIndex);
  }

  window.history.replaceState({}, document.title, current.toString());
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [errorText, setErrorText] = useState("");

  const nav = useNavigate();
  const initStartedRef = useRef(false);

  const tokenHash = useMemo(() => getCombinedUrlParam("token_hash"), []);
  const type = useMemo(() => getCombinedUrlParam("type"), []);
  const accessToken = useMemo(() => getCombinedUrlParam("access_token"), []);
  const refreshToken = useMemo(() => getCombinedUrlParam("refresh_token"), []);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    async function init() {
      setChecked(false);
      setErrorText("");

      try {
        if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            setRecoveryReady(false);
            setErrorText("This password reset link is invalid or has expired.");
            setChecked(true);
            return;
          }

          clearRecoveryParamsFromUrl();
          setRecoveryReady(true);
          setChecked(true);
          return;
        }

        if (accessToken && refreshToken && type === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setRecoveryReady(false);
            setErrorText("This password reset link is invalid or has expired.");
            setChecked(true);
            return;
          }

          clearRecoveryParamsFromUrl();
          setRecoveryReady(true);
          setChecked(true);
          return;
        }

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setRecoveryReady(true);
        } else {
          setRecoveryReady(false);
          setErrorText("This password reset link is invalid or has expired.");
        }
      } catch (err) {
        setRecoveryReady(false);
        setErrorText("This password reset link is invalid or has expired.");
        console.error("Reset link init error:", err);
      } finally {
        setChecked(true);
      }
    }

    void init();
  }, [tokenHash, type, accessToken, refreshToken]);

  async function updatePassword() {
    if (!recoveryReady) {
      alert("This password reset link is not valid or has expired.");
      return;
    }
    if (!password) return alert("Enter a new password.");
    if (password.length < 6) return alert("Password should be at least 6 characters.");
    if (password !== password2) return alert("Passwords do not match.");

    setBusy(true);

    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          lastError = error;
          if (isLockStolenError(error) && attempt < 2) {
            await sleep(250 * (attempt + 1));
            continue;
          }

          setBusy(false);
          alert("Update password error: " + error.message);
          return;
        }

        await supabase.auth.signOut();
        setBusy(false);
        alert("Password updated successfully. Please log in.");
        nav("/login", { replace: true });
        return;
      } catch (err) {
        lastError = err;
        if (isLockStolenError(err) && attempt < 2) {
          await sleep(250 * (attempt + 1));
          continue;
        }

        setBusy(false);
        const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
        alert("Update password error: " + message);
        return;
      }
    }

    setBusy(false);
    const finalMessage = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown error");
    alert("Update password error: " + finalMessage);
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
        <div style={{ fontSize: 12, color: "#6b7280" }}>Repeat new password</div>
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