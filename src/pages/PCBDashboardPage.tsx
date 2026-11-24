import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./dashboard.css";
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
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
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

      <p style={{ color: "#475569", textAlign: "left" }}>
        Create and manage your Process Canvases, including canvases shared with you.{" "}
        <Link to="/process-canvas">Learn about Process Canvas</Link>.
      </p>

      <div
        role="region"
        aria-label="My Process Canvases"
        tabIndex={0}
        style={{
          marginTop: 12,
          border: "1px solid #ddd",
          borderRadius: 12,
          overflowX: "auto",
          background: "white",
        }}
      >
        <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
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
                    <td style={td}>
                      <Link to={`/app/pcb/${r.id}`} className="blueprint-name-link">
                        {r.name}
                      </Link>
                    </td>
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
