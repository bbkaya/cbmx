// src/components/layout/SiteShell.tsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

type SiteShellProps = {
  children: React.ReactNode;
};

export default function SiteShell({ children }: SiteShellProps) {
  const { loading, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Logout failed: " + error.message);
      return;
    }
    nav("/", { replace: true });
  }

  function goSection(targetId: string) {
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
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        background: "#f8fafc",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
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
            flexWrap: "wrap",
          }}
        >
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
            <img
              src={`${import.meta.env.BASE_URL}images/CBMX-logo.png`}
              alt="CBMX logo"
              style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div style={{ fontWeight: 900, fontSize: 18 }}>CBMX</div>
          </Link>

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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
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

      <main
        style={{
          maxWidth: 1120,
          width: "100%",
          margin: "0 auto",
          padding: "20px 16px 48px 16px",
          alignSelf: "start",
        }}
      >
        {children}
      </main>

      <footer
        style={{
          maxWidth: 1120,
          width: "100%",
          margin: "0 auto",
          padding: "0 16px 24px 16px",
          color: "#6b7280",
          fontSize: 13,
          textAlign: "left",
        }}
      >
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
          <div style={{ marginBottom: 8 }}>
            CBMX is an approach developed by the Information Systems Group at Eindhoven University of Technology (TU/e).
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                alert("Contact o.turetken@tue.nl for any inquiries");
              }}
              style={footerLinkBtn}
            >
              Contact
            </button>
          </div>
        </div>
      </footer>
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

const footerLinkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#6b7280",
  cursor: "pointer",
  textDecoration: "underline",
};