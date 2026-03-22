// src/pages/ForgotPasswordPage.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendResetEmail() {
    const trimmed = email.trim();
    if (!trimmed) return alert("Enter your email first.");

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    setBusy(false);

    if (error) return alert("Reset password error: " + error.message);

    setSent(true);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Forgot password</div>

      <div style={{ fontSize: 13, color: "#6b7280" }}>
        Enter your email address and we will send you a password reset link.
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Email</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />
      </label>

      <button type="button" onClick={sendResetEmail} disabled={busy} style={{ height: 40, borderRadius: 10 }}>
        {busy ? "Sending…" : "Send reset email"}
      </button>

      {sent && (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 10,
            background: "white",
            fontSize: 13,
          }}
        >
          If the address exists in CBMX, a password reset link has been sent.
        </div>
      )}

      <div style={{ fontSize: 13 }}>
        Back to <Link to="/login">Login</Link>
      </div>
    </div>
  );
}