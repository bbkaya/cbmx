// src/pages/SignupPage.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function signUp() {
    if (!email.trim() || !password) return alert("Enter email + password first.");

    setBusy(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);

    if (error) return alert("Sign-up error: " + error.message);

    alert("Sign-up OK. If email confirmation is enabled, check your inbox; then login.");
    nav("/login");
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Sign up</div>

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

      <button type="button" onClick={signUp} disabled={busy} style={{ height: 40, borderRadius: 10 }}>
        {busy ? "Creating…" : "Create account"}
      </button>

      <div style={{ fontSize: 13 }}>
        Already have an account? <Link to="/login">Login</Link>
      </div>
    </div>
  );
}