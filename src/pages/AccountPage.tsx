// src/pages/AccountPage.tsx
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 10px 0" }}>Account</h2>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Signed in as</div>
        <div style={{ fontWeight: 700 }}>{user?.email}</div>

        <div style={{ height: 1, background: "#eee", margin: "12px 0" }} />

        <button
          type="button"
          onClick={async () => {
            const email = user?.email;
            if (!email) return alert("No email found for user.");

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/#/reset-password`,
            });

            if (error) return alert("Reset password error: " + error.message);
            alert("Password reset email sent.");
          }}
          style={{ height: 40, borderRadius: 10 }}
        >
          Send password reset email
        </button>
      </div>
    </div>
  );
}