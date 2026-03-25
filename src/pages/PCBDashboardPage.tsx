import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";
import {
  deepClonePCB,
  makeBlankProcessCanvasBlueprint,
  type ProcessCanvasBlueprint,
} from "../pcb/processCanvasDomain";
import {
  listAccessiblePCBs,
  type AccessiblePCBRow,
} from "../pcb/PCBData";

type PCBRowList = AccessiblePCBRow;

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const FULL_FIGURE_SRC = `${BASE_URL}images/PC-full.png`;
const SLIM_FIGURE_SRC = `${BASE_URL}images/PC-slim.png`;

type ExampleCard = {
  id: string;
  title: string;
  text: string;
  image: string;
};

const EXAMPLES: ExampleCard[] = [
  {
    id: "travel-journey",
    title: "Traveler Journey Process",
    text: "Example Process Canvas blueprint for a shared e-bike service traveler journey.",
    image: `${BASE_URL}images/TravelJourney.png`,
  },
  {
    id: "loan-processing",
    title: "Loan Processing",
    text: "Example Process Canvas blueprint for a loan processing process.",
    image: `${BASE_URL}images/LoanProcessing.png`,
  },
  {
    id: "order-fulfilment",
    title: "Order Fulfilment",
    text: "Example Process Canvas blueprint for an order fulfilment process.",
    image: `${BASE_URL}images/OrderFullfilment.png`,
  },
];

function makeDefaultPCBName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `New-Canvas-${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function nextSuffixName(base: string, existingNames: string[]): string {
  let maxN = 1;
  const re = new RegExp(`^${escapeRegExp(base)}\\s\\((\\d+)\\)$`);
  for (const n of existingNames) {
    if (n === base) {
      maxN = Math.max(maxN, 1);
      continue;
    }
    const m = n.match(re);
    if (m) {
      const num = Number(m[1]);
      if (Number.isFinite(num)) maxN = Math.max(maxN, num);
    }
  }
  return `${base} (${maxN + 1})`;
}

async function resolveUniqueNameForUser(
  ownerUserId: string,
  desiredRaw: string,
  excludeId?: string,
): Promise<string> {
  const desired = (desiredRaw ?? "").trim() || "Untitled Process Canvas";

  const desiredEsc = escapeIlikePattern(desired);
  const { data, error } = await supabase
    .from("process_canvas_blueprints")
    .select("id,name")
    .eq("owner_user_id", ownerUserId)
    .ilike("name", `${desiredEsc}%`);

  if (error) {
    return desired;
  }

  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  const names = rows
    .filter((r) => (excludeId ? r.id !== excludeId : true))
    .map((r) => (r.name ?? "").trim())
    .filter(Boolean);

  if (!names.includes(desired)) return desired;

  return nextSuffixName(desired, names);
}

function isUniqueViolation(err: any): boolean {
  return (
    err?.code === "23505" ||
    String(err?.message ?? "").toLowerCase().includes("duplicate key")
  );
}

function makeStarterPCB(name: string): ProcessCanvasBlueprint {
  const bp = makeBlankProcessCanvasBlueprint();
  const next = deepClonePCB(bp);
  next.meta.name = name;
  next.meta.updatedAt = new Date().toISOString();
  if (!next.meta.createdAt) next.meta.createdAt = next.meta.updatedAt;
  return next;
}

function sectionLabel(text: string) {
  return (
    <div
      style={{
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontWeight: 800,
        color: "#0d4678",
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

function cardStyle(): CSSProperties {
  return {
    border: "1px solid #dbe3ec",
    borderRadius: 18,
    background: "#ffffff",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  };
}

function ownerLabel(row: PCBRowList) {
  if (row.role === "owner") return "You";
  return row.owner_display_name?.trim() || row.owner_email || "Unknown user";
}

function canRenamePCB(row: PCBRowList) {
  return row.role === "owner" || row.role === "editor";
}

function canDeletePCB(row: PCBRowList) {
  return row.role === "owner";
}

export default function PCBDashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [rows, setRows] = useState<PCBRowList[]>([]);
  const [busy, setBusy] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);

  async function refresh() {
    if (!user) {
      setRows([]);
      return;
    }

    try {
      const data = await listAccessiblePCBs(user.id);
      setRows(data);
    } catch (error: any) {
      console.error("List PCBs error:", error);
      alert("List failed: " + String(error?.message ?? error));
      setRows([]);
    }
  }

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(loc.search);

    if (params.get("new") === "1") {
      params.delete("new");
      nav(`/app/pcbs${params.toString() ? `?${params.toString()}` : ""}`, {
        replace: true,
      });

      void createNew();
      return;
    }

    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loc.search]);

  async function createNew() {
    if (!user) return;

    setBusy(true);

    const desired = makeDefaultPCBName();
    let name = await resolveUniqueNameForUser(user.id, desired);
    let blueprint = makeStarterPCB(name);

    const attempt = async (n: string, bp: ProcessCanvasBlueprint) =>
      supabase
        .from("process_canvas_blueprints")
        .insert({
          owner_user_id: user.id,
          name: n,
          blueprint_json: bp,
        })
        .select("id")
        .single();

    let { data, error } = await attempt(name, blueprint);

    if (error && isUniqueViolation(error)) {
      name = await resolveUniqueNameForUser(user.id, name);
      blueprint = makeStarterPCB(name);
      const retry = await attempt(name, blueprint);
      data = retry.data as any;
      error = retry.error as any;
    }

    setBusy(false);

    if (error) return alert("Create failed: " + error.message);

    nav(`/app/pcb/${(data as any).id}`);
  }

  async function renameRow(id: string, currentName: string, role: PCBRowList["role"], ownerUserId: string) {
    if (!user) return;
    if (!(role === "owner" || role === "editor")) {
      alert("You do not have permission to rename this Process Canvas.");
      return;
    }

    const raw = window.prompt("Enter a new Process Canvas name:", currentName);
    if (raw === null) return;

    const desired = raw.trim();
    if (!desired) return alert("Name cannot be empty.");

    setBusy(true);

    let name = await resolveUniqueNameForUser(ownerUserId, desired, id);

    const attempt = async (n: string) => {
      const { data: row, error: readErr } = await supabase
        .from("process_canvas_blueprints")
        .select("id,blueprint_json")
        .eq("id", id)
        .single();

      if (readErr) return { data: null as any, error: readErr as any };

      const bp = deepClonePCB(
        (row as any).blueprint_json as ProcessCanvasBlueprint,
      );
      bp.meta = {
        ...(bp.meta ?? {
          id: "",
          name: "",
          version: "1.0.0",
        }),
        name: n,
        updatedAt: new Date().toISOString(),
      };

      return supabase
        .from("process_canvas_blueprints")
        .update({
          name: n,
          blueprint_json: bp,
        })
        .eq("id", id)
        .select("id,name")
        .single();
    };

    let { data, error } = await attempt(name);

    if (error && isUniqueViolation(error)) {
      name = await resolveUniqueNameForUser(ownerUserId, name, id);
      const retry = await attempt(name);
      data = retry.data as any;
      error = retry.error as any;
    }

    setBusy(false);

    if (error) return alert("Rename failed: " + error.message);

    const newName = (data as any)?.name ?? name;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, name: newName, updated_at: new Date().toISOString() }
          : r,
      ),
    );

    if (newName !== desired) {
      alert(`That name was already used. Renamed as “${newName}”.`);
    }
  }

  async function deleteRow(id: string, role: PCBRowList["role"]) {
    if (role !== "owner") {
      alert("Only the owner can delete this Process Canvas.");
      return;
    }

    const ok = window.confirm("Delete this Process Canvas?");
    if (!ok) return;

    setBusy(true);
    const { error } = await supabase
      .from("process_canvas_blueprints")
      .delete()
      .eq("id", id);
    setBusy(false);

    if (error) return alert("Delete failed: " + error.message);
    void refresh();
  }

  return (
    <div style={{ minWidth: 1200 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "left",
        }}
      >
        <h2 style={{ margin: 0 }}>My Process Canvases</h2>
        <button
          type="button"
          onClick={createNew}
          disabled={busy}
          style={{ height: 40, borderRadius: 10 }}
        >
          + New Process Canvas
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
          background: "white",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={th}>Name</th>
              <th style={th}>Role</th>
              <th style={th}>Owner</th>
              <th style={th}>Last updated</th>
              <th style={{ ...th, width: 320 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "#6b7280" }}>
                  No Process Canvases yet. Click “New Process Canvas”.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const mayRename = canRenamePCB(r);
                const mayDelete = canDeletePCB(r);

                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>{r.name}</td>
                    <td style={td}>{r.role}</td>
                    <td style={td}>{ownerLabel(r)}</td>
                    <td style={td}>
                      {new Date(r.updated_at).toLocaleString()}
                    </td>

<td
  style={{
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap",
  }}
>
  <button
    type="button"
    onClick={() => nav(`/app/pcb/${r.id}`)}
    style={{
      height: 34,
      borderRadius: 10,
      marginRight: 8,
    }}
  >
    Open
  </button>

  <button
    type="button"
    onClick={() => nav(`/app/pcb/${r.id}/share`)}
    style={{
      height: 34,
      borderRadius: 10,
      marginRight: mayRename || mayDelete ? 8 : 0,
    }}
  >
    Share
  </button>

  {mayRename ? (
    <button
      type="button"
      onClick={() => void renameRow(r.id, r.name, r.role, r.owner_user_id)}
      disabled={busy}
      style={{
        height: 34,
        borderRadius: 10,
        marginRight: mayDelete ? 8 : 0,
      }}
    >
      Rename
    </button>
  ) : null}

  {mayDelete ? (
    <button
      type="button"
      onClick={() => void deleteRow(r.id, r.role)}
      disabled={busy}
      style={{ height: 34, borderRadius: 10 }}
    >
      Delete
    </button>
  ) : null}
</td>



                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 84 }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.95fr)",
            gap: 28,
            alignItems: "left",
            marginBottom: 56,
          }}
        >
          <div>
            {sectionLabel("Strategic process design")}
            <h1
              style={{
                fontSize: 28,
                lineHeight: 1.08,
                margin: "0 0 18px 0",
                maxWidth: 760,
                textAlign: "left",
              }}
            >
              Explore business processes through feasibility, viability,
              desirability, and responsibility.
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.7,
                color: "#475569",
                margin: "0 0 24px 0",
                maxWidth: 760,
                textAlign: "left",
              }}
            >
              The Process Canvas helps represent the strategic layer of a
              process: why the process exists, what value it creates, and how it
              aligns with organizational goals across four complementary
              dimensions.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void createNew()}
                disabled={busy}
                style={{
                  padding: "12px 18px",
                  background: "#0d4678",
                  color: "#fff",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 800,
                  border: "none",
                  cursor: busy ? "default" : "pointer",
                }}
              >
                Create your Canvas
              </button>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("how");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  padding: "12px 18px",
                  border: "1px solid #cbd5e1",
                  color: "#0f172a",
                  borderRadius: 10,
                  fontWeight: 800,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                See how it works
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalImage(SLIM_FIGURE_SRC)}
            style={{
              ...cardStyle(),
              padding: 16,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <img
              src={SLIM_FIGURE_SRC}
              alt="Process Canvas overview"
              style={{
                width: "100%",
                height: 290,
                objectFit: "contain",
                display: "block",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            />
            <div
              style={{
                paddingTop: 12,
                color: "#475569",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Click to view the full Process Canvas figure.
            </div>
          </button>
        </section>

        <section id="what" style={{ marginTop: 30, scrollMarginTop: 110, textAlign: "left" }}>
          {sectionLabel("What is it")}
          <div style={{ ...cardStyle(), padding: 20, textAlign: "left" }}>
            <p style={{ lineHeight: 1.8, color: "#334155", marginTop: 0 }}>
              Process Science claims to be a multi-dimensional discipline aiming
              far beyond the established aim of a friction-free business
              process. However, established BPM tools—such as process lifecycle
              models, modelling standards, and process mining techniques—do not
              fully support this broader perspective on comprehensive process
              management. This disconnect between the ambitions of Process
              Science and the current BPM approaches motivated the development of
              the Process Canvas.
            </p>
            <p style={{ lineHeight: 1.8, color: "#334155" }}>
              The Process Canvas enables the exploration of a business process
              from four key perspectives: feasibility, viability, desirability,
              and responsibility.
            </p>
            <p style={{ lineHeight: 1.8, color: "#334155" }}>
              By integrating these dimensions into a unified framework, it
              extends the existing suite of BPM tools.
            </p>
            <p
              style={{
                lineHeight: 1.8,
                color: "#334155",
                marginBottom: 0,
              }}
            >
              The Process Canvas focuses on the strategic layer of a process—why
              the process exists, what value it creates, and how it aligns with
              organizational goals along these four dimensions. Such a
              representation can help establish a shared understanding among the
              diverse stakeholders involved in the process. It can complement
              formal process models and automation practices, and integrate with
              existing BPM activities such as process analysis and (re)design.
            </p>
          </div>
        </section>

        <section id="how" style={{ marginTop: 50, scrollMarginTop: 110, textAlign: "left" }}>
          {sectionLabel("How it works")}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 460px)",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div style={{ ...cardStyle(), padding: 24 }}>
              <p style={{ lineHeight: 1.8, color: "#334155", marginTop: 0 }}>
                The Process Canvas offers a single integrated representation in
                which the central purpose and goal of a process are connected to
                feasibility, desirability, viability, and responsibility
                concerns.
              </p>
              <p style={{ lineHeight: 1.8, color: "#334155" }}>
                In the editor, users can define and refine the core process
                elements, document strategic assumptions, and export the
                blueprint as JSON, PNG, or PDF for further use in workshops and
                design sessions. Exported JSON files can also be imported again
                for reuse or update.
              </p>
              <p
                style={{
                  lineHeight: 1.8,
                  color: "#334155",
                  marginBottom: 0,
                }}
              >
                The figure on the right shows the full Process Canvas structure
                and can be enlarged for closer inspection.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalImage(FULL_FIGURE_SRC)}
              style={{
                ...cardStyle(),
                padding: 14,
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <img
                src={FULL_FIGURE_SRC}
                alt="Full Process Canvas figure"
                style={{
                  width: "100%",
                  height: 260,
                  objectFit: "contain",
                  display: "block",
                  borderRadius: 12,
                  background: "#ffffff",
                }}
              />
              <div
                style={{
                  marginTop: 10,
                  color: "#475569",
                  fontSize: 14,
                  textAlign: "left",
                }}
              >
                Click to enlarge
              </div>
            </button>
          </div>
        </section>

        <section id="use-cases" style={{ marginTop: 44, scrollMarginTop: 110 }}>
          {sectionLabel("Use Cases")}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            {[
              {
                title: "Workshops",
                text: "Create a shared language among stakeholders when framing process redesign and innovation initiatives.",
              },
              {
                title: "Research",
                text: "Represent and compare process blueprints across cases, sectors, and analytical dimensions.",
              },
              {
                title: "Education",
                text: "Support classroom discussion and assignments on strategic process design and multi-dimensional process analysis.",
              },
            ].map((item) => (
              <div key={item.title} style={{ ...cardStyle(), padding: 22 }}>
                <h3 style={{ marginTop: 0, marginBottom: 10 }}>{item.title}</h3>
                <p style={{ lineHeight: 1.7, color: "#475569", margin: 0 }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="examples" style={{ marginTop: 44, scrollMarginTop: 110 }}>
          {sectionLabel("Examples")}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setModalImage(example.image)}
                style={{
                  ...cardStyle(),
                  padding: 16,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    height: 190,
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #dbe3ec",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    marginBottom: 14,
                  }}
                >
                  <img
                    src={example.image}
                    alt={example.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      background: "#ffffff",
                    }}
                  />
                </div>
                <h3 style={{ margin: "0 0 8px 0" }}>{example.title}</h3>
                <p style={{ lineHeight: 1.7, color: "#475569", margin: 0 }}>
                  {example.text}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {modalImage ? (
        <div
          onClick={() => setModalImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.82)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(1200px, 96vw)",
              maxHeight: "90vh",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setModalImage(null)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
            <img
              src={modalImage}
              alt="Expanded Process Canvas example"
              style={{
                maxWidth: "100%",
                maxHeight: "calc(90vh - 72px)",
                display: "block",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const th: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 12,
  color: "#374151",
};

const td: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 13,
};