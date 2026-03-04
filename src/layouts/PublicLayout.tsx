// src/layouts/PublicLayout.tsx
import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        background: "#f8fafc",
      }}
    >
      <div style={{ width: "min(520px, 100%)" }}>
        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 10 }}>CBMX</div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "white" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}