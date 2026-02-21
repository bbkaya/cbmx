import "./App.css";

export default function App() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>CBMX Blueprint Tool</h1>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => alert("New blueprint (next step)")}>
            New
          </button>
          <button type="button" onClick={() => alert("Export PNG (next step)")}>
            Export PNG
          </button>
          <button type="button" onClick={() => alert("Export PDF (next step)")}>
            Export PDF
          </button>
        </div>
      </header>

      <p style={{ marginTop: 8, color: "#444" }}>
        Goal: create, edit, and export CBMX blueprints (PNG/PDF). Next we’ll add the actual CBMX table layout.
      </p>

      <div
        id="cbmx-canvas"
        style={{
          marginTop: 16,
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 16,
          minHeight: 480,
          background: "white",
        }}
      >
        <strong>Canvas placeholder</strong>
        <div style={{ marginTop: 8, color: "#666" }}>
          In the next step, we will render the CBMX blueprint table here.
        </div>
      </div>
    </div>
  );
}