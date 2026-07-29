import React, { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, SquareSlash } from "lucide-react";
import { useSkillStore } from "../../stores/skillStore";
import { normalizeSkillName, isBuiltinSkill, type Skill } from "../../../shared/types";

interface DraftState {
  id: string | null;
  name: string;
  description: string;
  instructions: string;
}

const emptyDraft: DraftState = { id: null, name: "", description: "", instructions: "" };

export const SkillsSettings: React.FC = () => {
  const { skills, loading, error, fetchSkills, createSkill, updateSkill, deleteSkill } = useSkillStore();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, []);

  const editableSkills = skills.filter((s) => !isBuiltinSkill(s));

  const startEdit = (skill: Skill) => {
    setSaveError(null);
    setDraft({
      id: skill.id,
      name: skill.name,
      description: skill.description || "",
      instructions: skill.instructions
    });
  };

  const save = async () => {
    if (!draft) return;
    const name = normalizeSkillName(draft.name);
    if (!name) return setSaveError("Skill name is required.");
    if (!draft.instructions.trim()) return setSaveError("Instructions are required.");

    const clash = skills.find((s) => s.name === name && s.id !== draft.id);
    if (clash) {
      return setSaveError(
        isBuiltinSkill(clash)
          ? `/${name} is a built-in skill name and can't be reused.`
          : `A skill named /${name} already exists.`
      );
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (draft.id) {
        await updateSkill(draft.id, {
          name,
          description: draft.description.trim(),
          instructions: draft.instructions
        });
      } else {
        const created = await createSkill({
          name,
          description: draft.description.trim(),
          instructions: draft.instructions
        });
        if (!created) throw new Error("Failed to create skill");
      }
      setDraft(null);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  const slugPreview = draft ? normalizeSkillName(draft.name) : "";

  return (
    <div className="settings-panel settings-panel--narrow">
      <div className="settings-card">
        <h3 className="settings-card__title">
          <SquareSlash size={16} /> Skills
        </h3>
        <p className="settings-card__desc">
          Reusable instruction sets you can trigger in chat with a slash command. Type <code>/</code> in the message box
          to run one.
        </p>

        {!draft && (
          <div>
            <button
              onClick={() => {
                setSaveError(null);
                setDraft({ ...emptyDraft });
              }}
              className="settings-btn settings-btn--primary"
            >
              <Plus size={14} /> New Skill
            </button>
          </div>
        )}

        {error && <div className="settings-error">{error}</div>}

        {draft && (
          <div className="settings-subpanel">
            <span className="settings-eyebrow">{draft.id ? "Edit skill" : "New skill"}</span>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="code-review"
                className="settings-input"
                autoFocus
              />
            </label>
            <span className="settings-hint">
              {slugPreview ? `Triggered with /${slugPreview}` : "Letters, numbers and dashes only."}
            </span>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
              Description
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Short summary shown in the command palette"
                className="settings-input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
              Instructions
              <textarea
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                rows={8}
                className="settings-textarea"
                placeholder="What the assistant should do when this skill runs…"
              />
            </label>

            {saveError && <div className="settings-error">{saveError}</div>}

            <div className="settings-btn-row">
              <button onClick={save} disabled={saving} className="settings-btn settings-btn--primary">
                {saving ? "Saving…" : draft.id ? "Save Changes" : "Create Skill"}
              </button>
              <button onClick={() => setDraft(null)} className="settings-btn settings-btn--ghost">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Your Skills ({editableSkills.length})</h3>

        {loading && skills.length === 0 ? (
          <p className="settings-card__desc">Loading skills…</p>
        ) : editableSkills.length === 0 ? (
          <p className="settings-card__desc">No skills yet. Create one above, or ask the assistant to save one for you.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {editableSkills.map((skill) => (
              <div key={skill.id} className={"model-row" + (draft?.id === skill.id ? " model-row--active" : "")}>
                <div style={{ minWidth: 0 }}>
                  <div className="model-row__name">
                    /{skill.name}
                    {skill.createdBy === "model" && (
                      <span className="settings-hint" style={{ marginLeft: 8 }}>
                        saved by assistant
                      </span>
                    )}
                  </div>
                  <div className="model-row__size">
                    {skill.description || skill.instructions.slice(0, 80).replace(/\s+/g, " ")}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button onClick={() => startEdit(skill)} className="settings-btn settings-btn--ghost">
                    <Pencil size={14} /> Edit
                  </button>
                  {confirmDelete === skill.id ? (
                    <>
                      <button
                        onClick={async () => {
                          await deleteSkill(skill.id);
                          setConfirmDelete(null);
                          if (draft?.id === skill.id) setDraft(null);
                        }}
                        className="settings-btn settings-btn--danger"
                      >
                        Confirm
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="settings-btn settings-btn--ghost">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(skill.id)} className="settings-btn settings-btn--danger">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
