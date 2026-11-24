import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";
import { useAdminAccess } from "../admin/useAdminAccess";
import "./site-shell.css";

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
  return pathname === "/app/pcbs" || pathname === "/app/pcb/new" || pathname.startsWith("/app/pcb/");
}

export default function SiteShell({ children }: SiteShellProps) {
  const { loading, user, displayName } = useAuth();
  const adminAccess = useAdminAccess();
  const nav = useNavigate();
  const loc = useLocation();

  const [blueprintsMenuOpen, setBlueprintsMenuOpen] = React.useState(false);
  const blueprintsMenuRef = React.useRef<HTMLDivElement | null>(null);

  const onPCB = isPCBRoute(loc.pathname);
  const shellMaxWidth = onPCB ? 1200 : 1200;

  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!blueprintsMenuRef.current) return;
      if (!blueprintsMenuRef.current.contains(e.target as Node)) {
        setBlueprintsMenuOpen(false);
      }
    }

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && blueprintsMenuRef.current?.contains(document.activeElement)) {
        setBlueprintsMenuOpen(false);
        blueprintsMenuRef.current.querySelector("button")?.focus();
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, []);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Logout failed: " + error.message);
      return;
    }
    nav("/", { replace: true });
  }

  return (
    <div
      className="site-shell"
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
            boxSizing: "border-box",
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
              aria-label="Main navigation"
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-start",
              }}
            >
              <NavLink to="/" end className="site-nav-link" style={btnLink}>
                CBMX
              </NavLink>
              <NavLink to="/process-canvas" className="site-nav-link" style={btnLink}>
                Process Canvas
              </NavLink>
              {!loading && user ? (
                <div ref={blueprintsMenuRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setBlueprintsMenuOpen((v) => !v)}
                    className="site-nav-link" style={btn}
                    aria-controls="blueprints-navigation"
                    aria-expanded={blueprintsMenuOpen}
                    data-active={loc.pathname.startsWith("/app") && !loc.pathname.startsWith("/app/admin")}
                  >
                    My Blueprints ▾
                  </button>

                  {blueprintsMenuOpen ? (
                    <div
                      id="blueprints-navigation"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        minWidth: 220,
                        background: "white",
                        border: "1px solid #cbd5e1",
                        borderRadius: 12,
                        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.10)",
                        padding: 8,
                        zIndex: 40,
                      }}
                    >
                      <NavLink
                        to="/app"
                        end
                        onClick={() => setBlueprintsMenuOpen(false)}
                        className="site-nav-link" style={menuItemBtn}
                      >
                        My CBMX Blueprints
                      </NavLink>

                      <NavLink
                        to="/app/pcbs"
                        onClick={() => setBlueprintsMenuOpen(false)}
                        className="site-nav-link" style={menuItemBtn}
                      >
                        My Process Canvases
                      </NavLink>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                <NavLink
                  to="/account"
                  className="site-nav-link site-account-link"
                  title={user.email ?? ""}
                  style={{
                    ...btnLink,
                    display: "grid",
                    gap: 2,
                    maxWidth: "min(240px, 100%)",
                    minWidth: 0,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    borderRadius: 10,
                    padding: "7px 10px",
                    lineHeight: 1.15,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName || "User"}
                  </div>
                  {user.email ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {user.email}
                    </div>
                  ) : null}
                </NavLink>

                {adminAccess.status === "allowed" && <Link to="/app/admin" className="site-nav-link" style={btnLink}
                  aria-current={loc.pathname === "/app/admin" ? "page" : undefined}>Admin</Link>}

                <button
                  type="button"
                  onClick={() => void logout()}
                  className="site-nav-link"
                  style={btn}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="site-nav-link" style={btnLink}>
                  Log in
                </Link>
                <Link to="/signup" className="site-nav-link site-nav-primary" style={btnPrimaryLink}>
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
          minWidth: 0,
          boxSizing: "border-box",
          margin: "0 auto",
          padding: "20px 16px 72px 16px",
          alignSelf: "start",
        }}
      >
        {children}
      </main>

      <footer
        style={{
          maxWidth: shellMaxWidth,
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          margin: "0 auto",
          padding: "0 16px 12px 16px",
          color: "#6b7280",
          fontSize: 11,
          textAlign: "left",
        }}
      >
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
              gap: "16px 32px",
              lineHeight: 1.4,
            }}
          >
            <section aria-label="CBMX attribution" style={{ minWidth: 0 }}>
              <div style={footerLogoSlot}>
                <Link to="/" aria-label="CBMX home" style={{ display: "inline-flex" }}>
                  <img
                    src={`${import.meta.env.BASE_URL}images/CBMX-logo.png`}
                    alt="CBMX logo"
                    style={{ width: 92, height: "auto", objectFit: "contain" }}
                  />
                </Link>
              </div>
              <p style={footerAttribution}>
                Developed by the Information Systems Group at Eindhoven University of Technology (TU/e), The Netherlands.
              </p>
              <p style={footerCopyright}>© 2026 Eindhoven University of Technology (TU/e)</p>
            </section>

            <section aria-label="Process Canvas attribution" style={{ minWidth: 0 }}>
              <div style={footerLogoSlot}>
                <img
                  src={`${import.meta.env.BASE_URL}images/PClogo.png`}
                  alt="Process Canvas logo"
                  style={{ height: 36, width: "auto", objectFit: "contain" }}
                />
              </div>
              <p style={footerAttribution}>
                Developed by Prof. Dr. M. Rosemann (QUT), Prof. Dr. O. Türetken (TU/e), and Prof. Dr. C. Buck (THA).
              </p>
              <p style={footerCopyright}>
                © 2026 Queensland University of Technology (QUT), Eindhoven University of Technology (TU/e), and Technische Hochschule Augsburg (THA)
              </p>
            </section>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 8 }}>
            <a href="mailto:o.turetken@tue.nl" style={footerLink}>
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

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

const menuItemBtn: React.CSSProperties = {
  appearance: "none",
  display: "flex",
  alignItems: "center",
  width: "100%",
  textAlign: "left",
  minHeight: 38,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid transparent",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  boxSizing: "border-box",
};

const footerLogoSlot: React.CSSProperties = {
  height: 36,
  display: "flex",
  alignItems: "center",
};

const footerAttribution: React.CSSProperties = {
  margin: "6px 0 4px",
};

const footerCopyright: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  lineHeight: 1.4,
  color: "#64748b",
};

const footerLink: React.CSSProperties = {
  color: "#475569",
  textDecoration: "underline",
  fontSize: 11,
};
