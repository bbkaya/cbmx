import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";
import {
  addBlueprintMember,
  getBlueprintRole,
  leaveBlueprint,
  listBlueprintMembers,
  loadBlueprint,
  removeBlueprintMember,
  updateBlueprintMemberRole,
  type BlueprintAccessRole,
  type BlueprintMemberListRow,
} from "../cbmx/CBMXData";

type ShareableRole = Exclude<BlueprintAccessRole, "owner">;

type ProfileLookupRow = {
  id: string;
  email: string;
  display_name: string | null;
};

function memberLabel(row: BlueprintMemberListRow) {
  return row.display_name?.trim() || row.email || row.user_id;
}

export default function BlueprintSharePage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [blueprintName, setBlueprintName] = useState("");
  const [role, setRole] = useState<BlueprintAccessRole | null>(null);
  const [members, setMembers] = useState<BlueprintMemberListRow[]>([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ShareableRole>("viewer");

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "owner";

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const rank = (r: BlueprintAccessRole) =>
        r === "owner" ? 0 : r === "editor" ? 1 : 2;

      const diff = rank(a.role) - rank(b.role);
      if (diff !== 0) return diff;

      return memberLabel(a).localeCompare(memberLabel(b));
    });
  }, [members]);

  async function refresh() {
    if (!user?.id || !blueprintId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [bp, myRole, memberRows] = await Promise.all([
        loadBlueprint(blueprintId),
        getBlueprintRole(blueprintId, user.id),
        listBlueprintMembers(blueprintId),
      ]);

      setBlueprintName(bp.name);
      setRole(myRole);

      if (!myRole) {
        setMembers([]);
        setError("You do not have access to this blueprint.");
        return;
      }

      setMembers(memberRows);
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprintId, user?.id]);

  async function findProfileByEmail(emailRaw: string): Promise<ProfileLookupRow | null> {
    const email = emailRaw.trim().toLowerCase();
    if (!email) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Could not look up user profile.");
    }

    return (data as ProfileLookupRow | null) ?? null;
  }

  async function handleAddMember() {
    if (!blueprintId) return;
    if (!isOwner) {
      window.alert("Only the owner can add members.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      window.alert("Enter the email address of a registered user.");
      return;
    }

    setIsBusy(true);
    try {
      const profile = await findProfileByEmail(email);
      if (!profile?.id) {
        window.alert("No registered user/profile was found for that email.");
        return;
      }

      await addBlueprintMember({
        blueprintId,
        userId: profile.id,
        role: inviteRole,
      });

      setInviteEmail("");
      setInviteRole("viewer");
      await refresh();
    } catch (err: any) {
      window.alert("Could not add member: " + String(err?.message ?? err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: ShareableRole) {
    if (!blueprintId) return;
    if (!isOwner) {
      window.alert("Only the owner can change roles.");
      return;
    }

    setIsBusy(true);
    try {
      await updateBlueprintMemberRole({
        blueprintId,
        userId,
        role: nextRole,
      });
      await refresh();
    } catch (err: any) {
      window.alert("Could not update role: " + String(err?.message ?? err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!blueprintId) return;
    if (!isOwner) {
      window.alert("Only the owner can remove members.");
      return;
    }

    const ok = window.confirm("Remove this member from the blueprint?");
    if (!ok) return;

    setIsBusy(true);
    try {
      await removeBlueprintMember({
        blueprintId,
        userId,
      });
      await refresh();
    } catch (err: any) {
      window.alert("Could not remove member: " + String(err?.message ?? err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeave() {
    if (!blueprintId) return;
    if (role === "owner") {
      window.alert("The owner cannot leave their own blueprint.");
      return;
    }

    const ok = window.confirm("Leave this shared blueprint?");
    if (!ok) return;

    setIsBusy(true);
    try {
      await leaveBlueprint(blueprintId);
      navigate("/app");
    } catch (err: any) {
      window.alert("Could not leave blueprint: " + String(err?.message ?? err));
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return <div style={{ padding: 24 }}>Loading sharing settings…</div>;
  }

  if (!blueprintId || error) {
    return (
      <div style={{ maxWidth: 960 }}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/app">← Back to My Blueprints</Link>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Could not open sharing page</div>
          <div style={{ color: "#475569" }}>{error || "Missing blueprint id."}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ marginBottom: 6 }}>
            <Link to="/app">← Back to My Blueprints</Link>
          </div>
          <h2 style={{ margin: 0 }}>Share CBMX Blueprint</h2>
          <div style={{ color: "#64748b", marginTop: 4 }}>{blueprintName}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to={`/app/b/${blueprintId}`}>
            <button type="button" style={buttonStyle}>Open blueprint</button>
          </Link>

          {role !== "owner" ? (
            <button type="button" onClick={() => void handleLeave()} disabled={isBusy} style={dangerButtonStyle}>
              Leave shared blueprint
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Your access</div>
        <div style={{ color: "#475569" }}>
          You currently have <strong>{role}</strong> access.
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Members</div>

        {sortedMembers.length === 0 ? (
          <div style={{ color: "#64748b" }}>No members found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={th}>User</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={{ ...th, width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const isMe = m.user_id === user?.id;
                const lockedOwner = m.role === "owner";

                return (
                  <tr key={m.user_id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={td}>
                      {memberLabel(m)}
                      {isMe ? <span style={{ color: "#64748b" }}> (you)</span> : null}
                    </td>
                    <td style={td}>{m.email || "—"}</td>
                    <td style={td}>
                      {lockedOwner ? (
                        "owner"
                      ) : isOwner ? (
                        <select
                          value={m.role}
                          disabled={isBusy}
                          onChange={(e) =>
                            void handleRoleChange(m.user_id, e.target.value as ShareableRole)
                          }
                          style={selectStyle}
                        >
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {isOwner && !lockedOwner ? (
                        <button
                          type="button"
                          onClick={() => void handleRemove(m.user_id)}
                          disabled={isBusy}
                          style={dangerButtonStyle}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isOwner ? (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Add member</div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 180px 140px", gap: 10 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Registered user email"
              autoComplete="email"
              style={inputStyle}
            />

            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as ShareableRole)}
              style={selectStyle}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
            </select>

            <button
              type="button"
              onClick={() => void handleAddMember()}
              disabled={isBusy}
              style={buttonStyle}
            >
              Add member
            </button>
          </div>

          <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>
            Sharing currently works with already registered users whose profile exists in the system.
          </div>
        </div>
      ) : null}
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  background: "white",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
  color: "#374151",
};

const td: CSSProperties = {
  textAlign: "left",
  padding: "10px",
  fontSize: 13,
  verticalAlign: "middle",
};

const inputStyle: CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 14,
};

const selectStyle: CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 14,
  background: "white",
};

const buttonStyle: CSSProperties = {
  height: 40,
  borderRadius: 10,
};

const dangerButtonStyle: CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid #dc2626",
  color: "#991b1b",
  background: "white",
};