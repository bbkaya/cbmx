// src/pages/PCBDashboardPage.tsx
import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";
import {
  deepClonePCB,
  makeBlankProcessCanvasBlueprint,
  type ProcessCanvasBlueprint,
} from "../pcb/processCanvasDomain";

type PCBRowList = { id: string; name: string; updated_at: string };

function makeDefaultPCBName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `New-Blueprint-${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`;
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

async function resolveUniqueNameForUser(ownerUserId: string, desiredRaw: string, excludeId?: string): Promise<string> {
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
  return err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate key");
}

function makeStarterPCB(name: string): ProcessCanvasBlueprint {
  const bp = makeBlankProcessCanvasBlueprint();
  const next = deepClonePCB(bp);
  next.meta.name = name;
  next.meta.updatedAt = new Date().toISOString();
  if (!next.meta.createdAt) next.meta.createdAt = next.meta.updatedAt;
  return next;
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

    const { data, error } = await supabase
      .from("process_canvas_blueprints")
      .select("id,name,updated_at")
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("List PCBs error:", error);
      alert("List failed: " + error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as PCBRowList[]);
  }

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(loc.search);

    if (params.get("new") === "1") {
      params.delete("new");
      nav(`/app/pcbs${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });

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

  async function renameRow(id: string, currentName: string) {
    if (!user) return;

    const raw = window.prompt("Enter a new Process Canvas name:", currentName);
    if (raw === null) return;

    const desired = raw.trim();
    if (!desired) return alert("Name cannot be empty.");

    setBusy(true);

    let name = await resolveUniqueNameForUser(user.id, desired, id);

    const attempt = async (n: string) => {
      const { data: row, error: readErr } = await supabase
        .from("process_canvas_blueprints")
        .select("id,blueprint_json")
        .eq("id", id)
        .single();

      if (readErr) return { data: null as any, error: readErr as any };

      const bp = deepClonePCB((row as any).blueprint_json as ProcessCanvasBlueprint);
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
      name = await resolveUniqueNameForUser(user.id, name, id);
      const retry = await attempt(name);
      data = retry.data as any;
      error = retry.error as any;
    }

    setBusy(false);

    if (error) return alert("Rename failed: " + error.message);

    const newName = (data as any)?.name ?? name;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, name: newName, updated_at: new Date().toISOString() } : r,
      ),
    );

    if (newName !== desired) {
      alert(`That name was already used. Renamed as “${newName}”.`);
    }
  }

  async function deleteRow(id: string) {
    const ok = window.confirm("Delete this Process Canvas?");
    if (!ok) return;

    setBusy(true);
    const { error } = await supabase.from("process_canvas_blueprints").delete().eq("id", id);
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
              <th style={th}>Last updated</th>
              <th style={{ ...th, width: 320 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 12, color: "#6b7280" }}>
                  No Process Canvases yet. Click “New blueprint”.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{new Date(r.updated_at).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => nav(`/app/pcb/${r.id}`)}
                      style={{ height: 34, borderRadius: 10, marginRight: 8 }}
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      onClick={() => void renameRow(r.id, r.name)}
                      disabled={busy}
                      style={{ height: 34, borderRadius: 10, marginRight: 8 }}
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => void deleteRow(r.id)}
                      disabled={busy}
                      style={{ height: 34, borderRadius: 10 }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
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