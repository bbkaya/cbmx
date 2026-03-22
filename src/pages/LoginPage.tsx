// src/pages/LoginPage.tsx
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from as string | undefined;

  async function signIn() {
    if (!email.trim() || !password) return alert("Enter email + password first.");

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) return alert("Login error: " + error.message);

    nav(from || "/app", { replace: true });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Login</div>

      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Email</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Password</div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />
      </label>

      <button type="button" onClick={signIn} disabled={busy} style={{ height: 40, borderRadius: 10 }}>
        {busy ? "Signing in…" : "Login"}
      </button>

      <div style={{ fontSize: 13 }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </div>

      <div style={{ fontSize: 13 }}>
        No account? <Link to="/signup">Sign up</Link>
      </div>
    </div>
  );
}