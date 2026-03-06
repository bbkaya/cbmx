// src/pages/LandingPage.tsx
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import DashboardPage from "./DashboardPage";

export default function LandingPage() {
  const { loading, user } = useAuth();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "white",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>CBMX Online</div>

        <div style={{ color: "#374151", lineHeight: 1.5, display: "grid", gap: 10 }}>
          <div>
            This application supports creating and managing <b>CBMX blueprints</b> (Collaborative Business Model Matrix) for
            multi-actor business models and value co-creation networks.
          </div>

          <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", lineHeight: 1.5 }}>
            <li>Design the network value proposition</li>
            <li>Specify actors, costs/benefits, KPIs, services, and co-creation processes</li>
            <li>Export/import blueprints and maintain a personal repository</li>
          </ul>

          {loading ? (
            <div style={{ color: "#6b7280" }}>Checking session…</div>
          ) : user ? (
            <div style={{ color: "#065f46" }}>
              You are signed in as <b>{user.email}</b>. Your blueprints are shown below.
            </div>
          ) : (
            <div style={{ color: "#6b7280" }}>
              To start creating blueprints, please <Link to="/login">log in</Link> or <Link to="/signup">sign up</Link>.
            </div>
          )}
        </div>
      </section>

      {/* When logged in, show the list on the same landing page */}
      {user ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "white",
            padding: 16,
          }}
        >
          <DashboardPage />
        </section>
      ) : null}
    </div>
  );
}