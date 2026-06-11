"use client";

/**
 * Salesforce-style Activity feed for a single CRM contact.
 *
 * Renders rows from /api/crm-contacts/:id/activities, newest first, with
 * three quick-add buttons at the top: "הערה חדשה" (Comment), "משימה חדשה"
 * (Task), "תיעוד שיחה" (Call). Task rows expose a status dropdown that
 * triggers a PATCH and auto-creates a "Task Update" history row in the same
 * transaction, so the status history stays append-only.
 *
 * Mirrors src/components/site-profile/ActivityTimeline.tsx but writes to
 * contact_timeline_activities. Kept separate from the site timeline because
 * each row belongs to exactly one parent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, ClipboardList, Phone, History, Send, Plus, Loader2, X } from "lucide-react";
import type { ContactTimelineActivity, TaskPriority, TaskStatus } from "@/lib/types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";

interface Props {
  contactId: number;
}

type FeedActivityType = "Comment" | "Task" | "Task Update" | "Call";

const TYPE_HEBREW: Record<FeedActivityType, string> = {
  "Comment":     "הערה",
  "Task":        "משימה",
  "Task Update": "עדכון משימה",
  "Call":        "שיחה",
};
const STATUS_HEBREW: Record<TaskStatus, string> = {
  "Open": "פתוח", "In Progress": "בטיפול", "Done": "הושלם", "Cancelled": "בוטל",
};
const PRIORITY_HEBREW: Record<TaskPriority, string> = { Low: "נמוכה", Medium: "בינונית", High: "גבוהה" };
const STATUS_CLS: Record<TaskStatus, string> = {
  Open: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-yellow-50 text-yellow-700 border-yellow-200",
  Done: "bg-green-50 text-green-700 border-green-200",
  Cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};
const PRIORITY_CLS: Record<TaskPriority, string> = {
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-red-100 text-red-700",
};
const TYPE_BORDER: Record<FeedActivityType, string> = {
  Comment: "border-blue-100",
  Task: "border-indigo-100",
  "Task Update": "border-gray-100",
  Call: "border-emerald-100",
};
const TYPE_CHIP: Record<FeedActivityType, string> = {
  Comment: "bg-blue-50 text-blue-700",
  Task: "bg-indigo-50 text-indigo-700",
  "Task Update": "bg-gray-100 text-gray-600",
  Call: "bg-emerald-50 text-emerald-700",
};

const FILTERS: Array<{ value: FeedActivityType | "all"; label: string }> = [
  { value: "all",         label: "הכל" },
  { value: "Comment",     label: "הערות" },
  { value: "Task",        label: "משימות" },
  { value: "Call",        label: "שיחות" },
  { value: "Task Update", label: "היסטוריה" },
];

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function ContactActivityTimeline({ contactId }: Props) {
  const [activities, setActivities] = useState<ContactTimelineActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedActivityType | "all">("all");
  const [openForm, setOpenForm] = useState<"Comment" | "Task" | "Call" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm-contacts/${contactId}/activities`, { cache: "no-store" });
      const data = await res.json();
      setActivities(data.activities ?? []);
    } finally { setLoading(false); }
  }, [contactId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((a) => a.activity_type === filter);
  }, [activities, filter]);

  const changeStatus = async (id: number, status: TaskStatus) => {
    setError(null);
    try {
      const res = await fetch(`/api/contact-activities/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) { setError((e as Error).message); }
  };

  const deleteActivity = async (id: number) => {
    if (!confirm("האם למחוק רשומה זו?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/contact-activities/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">פעילויות</h3>
      </header>

      {/* Quick-add buttons (Salesforce-style row of icons) */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <QuickAddBtn icon={<MessageSquare className="w-4 h-4" />} label="הערה חדשה"
          active={openForm === "Comment"} onClick={() => setOpenForm(openForm === "Comment" ? null : "Comment")} color="blue" />
        <QuickAddBtn icon={<ClipboardList className="w-4 h-4" />} label="משימה חדשה"
          active={openForm === "Task"} onClick={() => setOpenForm(openForm === "Task" ? null : "Task")} color="indigo" />
        <QuickAddBtn icon={<Phone className="w-4 h-4" />} label="תיעוד שיחה"
          active={openForm === "Call"} onClick={() => setOpenForm(openForm === "Call" ? null : "Call")} color="emerald" />
      </div>

      {/* Inline composer for the active quick-add */}
      {openForm && (
        <QuickAddForm
          type={openForm}
          contactId={contactId}
          onCancel={() => setOpenForm(null)}
          onCreated={async () => { setOpenForm(null); await reload(); }}
        />
      )}

      {/* Filter chips */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              "px-2.5 py-1 text-xs rounded-full border " +
              (filter === f.value
                ? "bg-blue-50 border-blue-300 text-blue-800"
                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-800">{error}</div>
      )}

      {/* Feed */}
      <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-500">
            <History className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            אין פעילויות עדיין.
            <p className="text-xs mt-1">הוסף הערה, משימה או תיעוד שיחה כדי להתחיל.</p>
          </div>
        )}
        {!loading && filtered.map((a) => {
          const t = (a.activity_type as FeedActivityType);
          return (
            <article key={a.id} className={"border rounded-lg p-3 bg-white " + (TYPE_BORDER[t] ?? "border-gray-100")}>
              <header className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-semibold " + (TYPE_CHIP[t] ?? "bg-gray-100")}>
                    {TYPE_HEBREW[t] ?? t}
                  </span>
                  {a.priority && (
                    <span className={"text-[10px] px-1.5 py-0.5 rounded-full " + PRIORITY_CLS[a.priority]}>
                      {PRIORITY_HEBREW[a.priority]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">{fmtDate(a.created_at)}</span>
                  {a.activity_type !== "Task Update" && (
                    <button
                      type="button"
                      onClick={() => deleteActivity(a.id)}
                      className="text-gray-300 hover:text-red-600"
                      title="מחק"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </header>
              <p className="text-sm font-medium text-gray-900" dir="auto">{a.subject}</p>
              {a.body && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap" dir="auto">{a.body}</p>}
              {a.activity_type === "Task" && (
                <div className="mt-2 flex items-center gap-2">
                  {a.status && (
                    <select
                      value={a.status}
                      onChange={(e) => changeStatus(a.id, e.target.value as TaskStatus)}
                      className={"text-xs px-2 py-1 rounded-md border cursor-pointer " + STATUS_CLS[a.status]}
                    >
                      {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_HEBREW[s]}</option>)}
                    </select>
                  )}
                  {a.due_date && <span className="text-xs text-gray-500">יעד: <span dir="ltr">{a.due_date}</span></span>}
                  {a.assigned_to && <span className="text-xs text-gray-500">משויך: {a.assigned_to}</span>}
                </div>
              )}
              {a.created_by && <p className="text-[10px] text-gray-400 mt-1">על־ידי {a.created_by}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}


function QuickAddBtn({ icon, label, active, onClick, color }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
  color: "blue" | "indigo" | "emerald";
}) {
  const colorCls = active
    ? color === "blue" ? "bg-blue-600 text-white border-blue-600"
    : color === "indigo" ? "bg-indigo-600 text-white border-indigo-600"
    : "bg-emerald-600 text-white border-emerald-600"
    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={"inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border " + colorCls}
    >
      {icon} {label}
    </button>
  );
}


function QuickAddForm({
  type, contactId, onCancel, onCreated,
}: {
  type: "Comment" | "Task" | "Call";
  contactId: number;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const subjectFinal = type === "Comment" ? "Comment added"
      : type === "Call" ? (subject.trim() || "Logged call")
      : subject.trim();
    if (type === "Task" && !subjectFinal) {
      setError("נושא משימה הוא חובה");
      return;
    }
    if (type === "Comment" && !body.trim()) {
      setError("יש להזין הערה");
      return;
    }
    if (type === "Call" && !body.trim() && !subject.trim()) {
      setError("יש להזין תוכן לשיחה");
      return;
    }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/crm-contacts/${contactId}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: type,
          subject: subjectFinal,
          body: body || undefined,
          priority: type === "Task" ? priority : undefined,
          due_date: type === "Task" ? (dueDate || undefined) : undefined,
          assigned_to: type === "Task" ? (assignedTo || undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSubject(""); setBody(""); setDueDate(""); setAssignedTo(""); setPriority("Medium");
      await onCreated();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 space-y-2">
      {type !== "Comment" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={type === "Task" ? "נושא המשימה" : "כותרת שיחה (אופציונלי)"}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
          dir="auto"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={type === "Comment" ? "כתוב הערה..." : type === "Task" ? "תיאור (אופציונלי)" : "פרטי השיחה..."}
        rows={2}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md resize-y"
        dir="auto"
      />
      {type === "Task" && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-600">עדיפות:
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="ml-1 text-xs px-1.5 py-0.5 border border-gray-200 rounded">
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_HEBREW[p]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">יעד:
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="ml-1 text-xs px-1.5 py-0.5 border border-gray-200 rounded" dir="ltr" />
          </label>
          <label className="text-xs text-gray-600">משויך ל:
            <input type="text" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="שם"
              className="ml-1 text-xs px-1.5 py-0.5 border border-gray-200 rounded w-28" />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} disabled={busy}
          className="px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700">
          ביטול
        </button>
        <button onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (type === "Comment" ? <Send className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
          {type === "Comment" ? "שלח" : type === "Task" ? "צור משימה" : "תעד שיחה"}
        </button>
      </div>
    </div>
  );
}
