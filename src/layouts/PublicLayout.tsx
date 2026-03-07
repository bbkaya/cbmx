// src/layouts/PublicLayout.tsx
import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";

type NavItem = { label: string; targetId: string };

const NAV: NavItem[] = [
  { label: "What is CBMX", targetId: "what-is" },
  { label: "How it works", targetId: "how-it-works" },
  { label: "Use cases", targetId: "use-cases" },
  { label: "Example blueprint", targetId: "example" },
];

function requestScrollTo(targetId: string) {
  sessionStorage.setItem("cbmx_scroll_target", targetId);
}

function consumeScrollTarget(): string | null {
  const v = sessionStorage.getItem("cbmx_scroll_target");
  if (!v) return null;
  sessionStorage.removeItem("cbmx_scroll_target");
  return v;
}

export function useLandingScrollHandler() {
  React.useEffect(() => {
    const target = consumeScrollTarget();
    if (!target) return;
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
}

export default function PublicLayout() {
  const { loading, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) alert("Logout failed: " + error.message);
    nav("/", { replace: true });
  }

  function goSection(targetId: string) {
    // If not already on "/", route to "/" then scroll (stored in sessionStorage)
    if (loc.pathname !== "/") {
      requestScrollTo(targetId);
      nav("/", { replace: false });
      return;
    }
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        background: "#f8fafc",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(248,250,252,0.92)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          {/* Logo */}
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {/* Put CBMX-logo.png in /public so it resolves from "/" */}
            <img
              src="/CBMX-logo.png"
              alt="CBMX logo"
              style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain" }}
              onError={(e) => {
                // If logo not present yet, fail gracefully (no crash)
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div style={{ fontWeight: 900, fontSize: 18 }}>CBMX</div>
          </Link>

          {/* Top navigation */}
          <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {NAV.map((it) => (
              <button
                key={it.targetId}
                type="button"
                onClick={() => goSection(it.targetId)}
                style={navLinkBtn}
              >
                {it.label}
              </button>
            ))}

            {/* My Blueprints in top nav */}
            {user ? (
              <Link to="/app" style={navLink}>
                My Blueprints
              </Link>
            ) : (
              <button type="button" onClick={() => nav("/login")} style={navLinkBtn}>
                My Blueprints
              </button>
            )}
          </nav>

          {/* Top-right buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
            {loading ? (
              <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
            ) : user ? (
              <>
                <div
                  title={user.email ?? ""}
                  style={{
                    fontSize: 13,
                    color: "#111827",
                    maxWidth: 240,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    border: "1px solid #e5e7eb",
                    background: "white",
                    borderRadius: 10,
                    padding: "7px 10px",
                  }}
                >
                  {user.email ?? "User"}
                </div>

                <Link to="/app" style={btnLink}>
                  My Blueprints
                </Link>

                <Link to="/account" style={btnLink}>
                  Account
                </Link>

                <button type="button" onClick={() => void logout()} style={btn}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={btnLink}>
                  Log in
                </Link>
                <Link to="/signup" style={btnPrimaryLink}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 16px 48px 16px" }}>
        <Outlet />
      </main>
    </div>
  );
}

const btnBase: React.CSSProperties = {
  height: 34,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  padding: "0 10px",
  fontSize: 13,
  cursor: "pointer",
};

const btn: React.CSSProperties = { ...btnBase };

const btnLink: React.CSSProperties = {
  ...btnBase,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
};

const btnPrimaryLink: React.CSSProperties = {
  ...btnLink,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
};

const navLink: React.CSSProperties = {
  fontSize: 13,
  textDecoration: "none",
  color: "#111827",
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid transparent",
};

const navLinkBtn: React.CSSProperties = {
  fontSize: 13,
  background: "transparent",
  border: "1px solid transparent",
  color: "#111827",
  cursor: "pointer",
  padding: "6px 8px",
  borderRadius: 10,
};