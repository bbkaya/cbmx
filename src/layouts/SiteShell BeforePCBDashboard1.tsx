import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";

type NavItem = { label: string; targetId: string };

const NAV: NavItem[] = [
  { label: "What is CBMX", targetId: "what-is" },
  { label: "How it Works", targetId: "how-it-works" },
  { label: "Use Cases & Examples", targetId: "use-cases" },
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

export function useLandingSectionRouting() {
  return useLandingScrollHandler();
}

type SiteShellProps = {
  children: React.ReactNode;
};

function isPCBRoute(pathname: string) {
  return pathname === "/app/pcb/new" || pathname.startsWith("/app/pcb/");
}

function isCBMXEditorRoute(pathname: string) {
  return pathname.startsWith("/app/b/");
}

export default function SiteShell({ children }: SiteShellProps) {
  const { loading, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const onPCB = isPCBRoute(loc.pathname);
  const onCBMXEditor = isCBMXEditorRoute(loc.pathname);
  const shellMaxWidth = onPCB ? 1200 : 1200;

  function applyHover(e: React.MouseEvent<HTMLElement>) {
    e.currentTarget.style.transition = "background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease";
    e.currentTarget.style.backgroundColor = "#f1f5f9";
    e.currentTarget.style.borderColor = "#94a3b8";
    e.currentTarget.style.color = "#0f172a";
    e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.06)";
  }

  function clearHover(e: React.MouseEvent<HTMLElement>) {
    e.currentTarget.style.backgroundColor = "";
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.color = "";
    e.currentTarget.style.boxShadow = "";
  }

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
            maxWidth: shellMaxWidth,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              justifyContent: "flex-start",
              flex: "1 1 640px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                  style={{ width: 75, height: 28, borderRadius: 6, objectFit: "contain" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </Link>
            </div>

            <nav
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-start",
              }}
            >
              {NAV.map((it) => (
                <button
                  key={it.targetId}
                  type="button"
                  onClick={() => goSection(it.targetId)}
                  onMouseEnter={applyHover}
                  onMouseLeave={clearHover}
                  style={navLinkBtn}
                >
                  {it.label}
                </button>
              ))}
            </nav>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
              flex: "0 1 auto",
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

                <Link to="/app" style={btnLink} onMouseEnter={applyHover} onMouseLeave={clearHover}>
                  My CBMX Blueprints
                </Link>

                <Link to="/account" style={btnLink} onMouseEnter={applyHover} onMouseLeave={clearHover}>
                  Account
                </Link>

                <button
                  type="button"
                  onClick={() => void logout()}
                  onMouseEnter={applyHover}
                  onMouseLeave={clearHover}
                  style={btn}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={btnLink} onMouseEnter={applyHover} onMouseLeave={clearHover}>
                  Log in
                </Link>
                <Link to="/signup" style={btnPrimaryLink} onMouseEnter={applyHover} onMouseLeave={clearHover}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: shellMaxWidth,
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
          maxWidth: shellMaxWidth,
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
                style={{ width: 70, height: 20, borderRadius: 5, objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </Link>{" "}
            is developed by the Information Systems Group at Eindhoven University of Technology (TU/e), The Netherlands.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

const navLink: React.CSSProperties = {
  color: "#334155",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
};

const navLinkBtn: React.CSSProperties = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "white",
  cursor: "pointer",
  color: "#0f172a",
  fontWeight: 600,
  fontSize: 14,
  boxSizing: "border-box",
};

const btnLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const btnPrimaryLink: React.CSSProperties = {
  ...btnLink,
  background: "#0f172a",
  color: "white",
  border: "1px solid #0f172a",
};

const btn: React.CSSProperties = {
  appearance: "none",
  minHeight: 36,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const footerLinkBtn: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "#475569",
  textDecoration: "underline",
  fontSize: 13,
};
