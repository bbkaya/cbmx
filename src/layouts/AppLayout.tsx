// src/layouts/AppLayout.tsx
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";

export default function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!menuOpen) return;
      const target = e.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (!menuOpen) return;
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [menuOpen]);

  async function signOut() {
    setMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) alert("Logout error: " + error.message);
    navigate("/login");
  }

  const label = user?.email ?? "Account";

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >

        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <Link to="/app" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Collaborative Business Model Matrix(CBMX)</div>
          </Link>
          <div style={{ fontSize: 18, color: "#6b7280" }}>Blueprint Editor</div>
        </div>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              height: 36,
              borderRadius: 10,
              padding: "0 12px",
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
            title="Account"
          >
            {label} ▾
          </button>

          {menuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 40,
                minWidth: 200,
                background: "white",
                border: "1px solid #ddd",
                borderRadius: 12,
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                padding: 6,
                zIndex: 50,
              }}
            >
              <MenuLink to="/account" onClick={() => setMenuOpen(false)} label="Account" />
              <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />
              <button
                type="button"
                onClick={signOut}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div style={{ marginTop: 16 }}>
        <Outlet />
      </div>
    </div>
  );
}

function MenuLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: "8px 10px",
        borderRadius: 10,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "#f3f4f6")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")}
    >
      {label}
    </Link>
  );
}
