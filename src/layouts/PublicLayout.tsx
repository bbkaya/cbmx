// src/layouts/PublicLayout.tsx
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";

export default function PublicLayout() {
  const { loading, user } = useAuth();
  const nav = useNavigate();

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) alert("Logout failed: " + error.message);
    nav("/", { replace: true });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        background: "#f8fafc",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(248,250,252,0.9)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 20 }}>CBMX</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Collaborative Business Model Matrix</div>
          </Link>

          {/* Upper-right auth/account */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {loading ? (
              <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
            ) : user ? (
              <>
                <Link to="/app" style={linkBtn}>
                  My Blueprints
                </Link>

                <Link
                  to="/account"
                  title="Account"
                  style={{
                    ...linkBtn,
                    maxWidth: 260,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.email ?? "Account"}
                </Link>

                <button type="button" onClick={() => void logout()} style={btn}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={linkBtn}>
                  Login
                </Link>
                <Link to="/signup" style={primaryLinkBtn}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 40px 16px" }}>
        <Outlet />
      </main>
    </div>
  );
}

const btn: React.CSSProperties = {
  height: 34,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  padding: "0 10px",
  fontSize: 13,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  ...btn,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
};

const primaryLinkBtn: React.CSSProperties = {
  ...linkBtn,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
};