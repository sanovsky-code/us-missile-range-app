"use client";

import { useState } from "react";
import { SiteRangeActivity } from "@/lib/types";
import {
  ACTIVITY_CATEGORIES, ACTIVITY_STATUSES, ACTIVITY_CONFIDENCE_LEVELS,
} from "@/lib/types";
import Badge, { StatusBadge, ConfidenceBadge } from "@/components/ui/Badge";
import { Activity, ChevronDown, ChevronUp, ExternalLink, Pencil, Save, X, Loader2 } from "lucide-react";
import ActivityHistoryFeed from "./ActivityHistoryFeed";
import { useCurrentUser } from "@/lib/current-user";

const categoryColors: Record<string, string> = {
  "Missile Test": "red",
  "Space Launch": "purple",
  "Radar Tracking": "blue",
  "Telemetry": "blue",
  "Missile Defense": "orange",
  "Range Safety": "green",
  "Aerospace Test": "purple",
  "Other": "gray",
};

const categoryHebrew: Record<string, string> = {
  "Missile Test": "ניסוי טילים",
  "Space Launch": "שיגור לחלל",
  "Radar Tracking": "מעקב מכ\"מ",
  "Telemetry": "טלמטריה",
  "Missile Defense": "הגנה מפני טילים",
  "Range Safety": "בטיחות מטווח",
  "Aerospace Test": "ניסוי אווירי-חללי",
  "Other": "אחר",
};

const statusHebrew: Record<string, string> = {
  Current: "פעיל",
  Historical: "היסטורי",
  Planned: "מתוכנן",
  Unknown: "לא ידוע",
};

interface FormState {
  activity_category: string;
  activity_description: string;
  missile_or_system_type: string;
  start_year: string;
  end_year: string;
  status: string;
  source_id: string;
  confidence_level: string;
}

function toForm(a: SiteRangeActivity): FormState {
  return {
    activity_category: a.activity_category ?? "",
    activity_description: a.activity_description ?? "",
    missile_or_system_type: a.missile_or_system_type ?? "",
    start_year: a.start_year ? String(a.start_year) : "",
    end_year: a.end_year ? String(a.end_year) : "",
    status: a.status ?? "",
    source_id: a.source_id ?? "",
    confidence_level: a.confidence_level ?? "",
  };
}

export default function ActivitiesSection({ activities: initialActivities }: { activities: SiteRangeActivity[] }) {
  const { currentUser } = useCurrentUser();
  // Local copy so inline edits update the displayed rows without a full
  // parent-page re-fetch.
  const [activities, setActivities] = useState<SiteRangeActivity[]>(initialActivities);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (a: SiteRangeActivity) => {
    setEditingId(a.activity_id);
    setForm(toForm(a));
    setExpanded((prev) => new Set(prev).add(a.activity_id));
    setError(null);
  };
  const cancelEdit = () => { setEditingId(null); setForm(null); setError(null); };

  const save = async () => {
    if (!editingId || !form) return;
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        activity_category: form.activity_category || undefined,
        activity_description: form.activity_description || undefined,
        missile_or_system_type: form.missile_or_system_type === "" ? null : form.missile_or_system_type,
        start_year: form.start_year === "" ? null : Number(form.start_year),
        end_year: form.end_year === "" ? null : Number(form.end_year),
        status: form.status || undefined,
        source_id: form.source_id === "" ? null : form.source_id,
        confidence_level: form.confidence_level || undefined,
        updated_by: currentUser?.trim() || undefined,
      };
      const res = await fetch(`/api/range-activities/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const updated = j.activity as SiteRangeActivity;
      setActivities((prev) => prev.map((x) => x.activity_id === updated.activity_id ? updated : x));
      setEditingId(null);
      setForm(null);
      setHistoryTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">פעילויות</h2>
        <p className="text-sm text-gray-500">אין רשומות פעילות זמינות לאתר זה.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-green-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          פעילויות ({activities.length})
        </h2>
      </div>
      <div className="grid gap-3">
        {activities.map((act) => {
          const isOpen = expanded.has(act.activity_id);
          const isEditing = editingId === act.activity_id;
          return (
            <div
              key={act.activity_id}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              <div
                onClick={() => !isEditing && toggle(act.activity_id)}
                className={"w-full p-4 hover:bg-gray-50 " + (isEditing ? "" : "cursor-pointer")}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1 flex-shrink-0">
                    {isOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge color={categoryColors[act.activity_category] || "gray"}>
                        {categoryHebrew[act.activity_category] || act.activity_category}
                      </Badge>
                      <StatusBadge status={statusHebrew[act.status] || act.status} />
                      <ConfidenceBadge level={act.confidence_level} />
                    </div>
                    <p
                      className={"text-sm text-gray-700 leading-relaxed text-left " + (isOpen ? "" : "line-clamp-2")}
                      dir="ltr"
                    >
                      {act.activity_description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                      {act.missile_or_system_type && (
                        <span>מערכות: <span dir="ltr">{act.missile_or_system_type}</span></span>
                      )}
                      {act.start_year && (
                        <span>
                          {act.start_year}
                          {act.end_year ? ` – ${act.end_year}` : " – הווה"}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(act); }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md flex-shrink-0"
                      title="עריכה"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/40 p-4 space-y-3">
                  {isEditing && form ? (
                    <ActivityEditForm
                      form={form}
                      setForm={setForm}
                      error={error}
                      busy={busy}
                      onSubmit={save}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <ActivityField label="activity_id">
                        <span className="font-mono text-gray-700" dir="ltr">{act.activity_id}</span>
                      </ActivityField>
                      <ActivityField label="activity_category">
                        <span dir="ltr">{act.activity_category}</span>
                      </ActivityField>
                      <ActivityField label="status">
                        <span dir="ltr">{act.status}</span>
                        <span className="text-gray-500"> ({statusHebrew[act.status] || act.status})</span>
                      </ActivityField>
                      <ActivityField label="confidence_level">
                        <span dir="ltr">{act.confidence_level}</span>
                      </ActivityField>
                      <ActivityField label="missile_or_system_type">
                        <span dir="ltr">{act.missile_or_system_type || "—"}</span>
                      </ActivityField>
                      <ActivityField label="years">
                        {act.start_year || act.end_year
                          ? <span dir="ltr">{act.start_year ?? "—"} – {act.end_year ?? "הווה"}</span>
                          : <span className="text-gray-400">—</span>}
                      </ActivityField>
                      <ActivityField label="activity_description" wide>
                        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-left" dir="ltr">
                          {act.activity_description}
                        </p>
                      </ActivityField>
                      <ActivityField label="source_id">
                        {act.source_id
                          ? <a href={`/source/${act.source_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1 font-mono" dir="ltr">
                              {act.source_id}<ExternalLink className="w-3 h-3" />
                            </a>
                          : <span className="text-gray-400">—</span>}
                      </ActivityField>
                    </div>
                  )}
                  <ActivityHistoryFeed activityId={act.activity_id} refreshTick={historyTick} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

function ActivityEditForm({
  form, setForm, error, busy, onSubmit, onCancel,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3 border border-purple-200 bg-purple-50/30 rounded-md p-3">
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">קטגוריה</label>
          <select value={form.activity_category} onChange={set("activity_category")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white">
            <option value="">—</option>
            {ACTIVITY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">סטטוס</label>
          <select value={form.status} onChange={set("status")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white">
            <option value="">—</option>
            {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">רמת מהימנות</label>
          <select value={form.confidence_level} onChange={set("confidence_level")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white">
            <option value="">—</option>
            {ACTIVITY_CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">מערכת / טיל</label>
          <input value={form.missile_or_system_type} onChange={set("missile_or_system_type")}
            placeholder="V-2, Patriot, Nike Zeus, ..."
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">שנת התחלה</label>
          <input type="number" min={1900} max={2100} value={form.start_year} onChange={set("start_year")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">שנת סיום</label>
          <input type="number" min={1900} max={2100} value={form.end_year} onChange={set("end_year")}
            placeholder="ריק = הווה"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">תיאור</label>
          <textarea value={form.activity_description} onChange={set("activity_description")} rows={4}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">source_id</label>
          <input value={form.source_id} onChange={set("source_id")}
            placeholder="SRC-0001" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 rounded text-gray-700">
          <X className="w-3 h-3" /> ביטול
        </button>
        <button onClick={onSubmit} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          שמור
        </button>
      </div>
    </div>
  );
}
