"use client";

/**
 * Salesforce-style Activity feed for a single Opportunity.
 *
 * Quick-add buttons (matches the Salesforce "New Task", "Log a Call",
 * "New Event" row): Comment / Task / Call / Event. Event rows expose extra
 * fields (start_at, end_at, location, attendees). All rows render newest-first
 * and Task rows have an inline status dropdown that auto-creates a Task
 * Update history row.
 *
 * Mirrors ContactActivityTimeline but writes to opportunity_timeline_activities
 * and supports the "Event" activity type.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare, ClipboardList, Phone, Calendar, History, Send, Plus, Loader2, X,
  MapPin, Users,
} from "lucide-react";
import type { OpportunityTimelineActivity, TaskPriority, TaskStatus } from "@/lib/types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  opportunityId: number;
}

type FeedActivityType = "Comment" | "Task" | "Task Update" | "Call" | "Event";

const TYPE_HEBREW: Record<FeedActivityType, string> = {
  "Comment":     "הערה",
  "Task":        "משימה",
  "Task Update": "עדכון משימה",
  "Call":        "שיחה",
  "Event":       "אירוע",
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
  Event: "border-purple-100",
};
const TYPE_CHIP: Record<FeedActivityType, string> = {
  Comment: "bg-blue-50 text-blue-700",
  Task: "bg-indigo-50 text-indigo-700",
  "Task Update": "bg-gray-100 text-gray-600",
  Call: "bg-emerald-50 text-emerald-700",
  Event: "bg-purple-50 text-purple-700",
};

const FILTERS: Array<{ value: FeedActivityType | "all"; label: string }> = [
  { value: "all",         label: "הכל" },
  { value: "Comment",     label: "הערות" },
  { value: "Task",        label: "משימות" },
  { value: "Call",        label: "שיחות" },
  { value: "Event",       label: "אירועים" },
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

function fmtEventTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function OpportunityActivityTimeline({ opportunityId }: Props) {
  const { currentUser } = useCurrentUser();
  const [activities, setActivities] = useState<OpportunityTimelineActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedActivityType | "all">("all");
  const [openForm, setOpenForm] = useState<"Comment" | "Task" | "Call" | "Event" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/activities`, { cache: "no-store" });
      const data = await res.json();
      setActivities(data.activities ?? []);
    } finally { setLoading(false); }
  }, [opportunityId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((a) => a.activity_type === filter);
  }, [activities, filter]);

  const changeStatus = async (id: number, status: TaskStatus) => {
    setError(null);
    try {
      const res = await fetch(`/api/opportunity-activities/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, created_by: currentUser || undefined }),
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
      const res = await fetch(`/api/opportunity-activities/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">פעילויות</h3>
      </header>

      {/* Quick-add buttons */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <QuickAddBtn icon={<MessageSquare className="w-4 h-4" />} label="הערה"
          active={openForm === "Comment"} onClick={() => setOpenForm(openForm === "Comment" ? null : "Comment")} color="blue" />
        <QuickAddBtn icon={<ClipboardList className="w-4 h-4" />} label="משימה"
          active={openForm === "Task"} onClick={() => setOpenForm(openForm === "Task" ? null : "Task")} color="indigo" />
        <QuickAddBtn icon={<Phone className="w-4 h-4" />} label="תיעוד שיחה"
          active={openForm === "Call"} onClick={() => setOpenForm(openForm === "Call" ? null : "Call")} color="emerald" />
        <QuickAddBtn icon={<Calendar className="w-4 h-4" />} label="אירוע"
          active={openForm === "Event"} onClick={() => setOpenForm(openForm === "Event" ? null : "Event")} color="purple" />
      </div>

      {openForm && (
        <QuickAddForm
          type={openForm}
          opportunityId={opportunityId}
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

      <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-500">
            <History className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            אין פעילויות עדיין.
            <p className="text-xs mt-1">הוסף הערה, משימה, שיחה או אירוע כדי להתחיל.</p>
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

              {/* Task-specific row */}
              {a.activity_type === "Task" && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
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

              {/* Event-specific row */}
              {a.activity_type === "Event" && (
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  {(a.start_at || a.end_at) && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span dir="ltr">
                        {fmtEventTime(a.start_at)}{a.end_at ? ` → ${fmtEventTime(a.end_at)}` : ""}
                      </span>
                    </div>
                  )}
                  {a.location && (
                    <div className="flex items-center gap-1" dir="auto">
                      <MapPin className="w-3 h-3" /> {a.location}
                    </div>
                  )}
                  {a.attendees && (
                    <div className="flex items-center gap-1" dir="auto">
                      <Users className="w-3 h-3" /> {a.attendees}
                    </div>
                  )}
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
  color: "blue" | "indigo" | "emerald" | "purple";
}) {
  const colorCls = active
    ? color === "blue" ? "bg-blue-600 text-white border-blue-600"
    : color === "indigo" ? "bg-indigo-600 text-white border-indigo-600"
    : color === "emerald" ? "bg-emerald-600 text-white border-emerald-600"
    : "bg-purple-600 text-white border-purple-600"
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
  type, opportunityId, onCancel, onCreated,
}: {
  type: "Comment" | "Task" | "Call" | "Event";
  opportunityId: number;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const { currentUser } = useCurrentUser();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState("");
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
    if (type === "Event" && !subjectFinal) {
      setError("נושא האירוע הוא חובה");
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
      const res = await fetch(`/api/opportunities/${opportunityId}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: type,
          subject: subjectFinal,
          body: body || undefined,
          priority: type === "Task" ? priority : undefined,
          due_date: type === "Task" ? (dueDate || undefined) : undefined,
          assigned_to: type === "Task" ? (assignedTo || undefined) : undefined,
          start_at: type === "Event" ? (startAt || undefined) : undefined,
          end_at: type === "Event" ? (endAt || undefined) : undefined,
          location: type === "Event" ? (location || undefined) : undefined,
          attendees: type === "Event" ? (attendees || undefined) : undefined,
          created_by: currentUser || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSubject(""); setBody(""); setDueDate(""); setAssignedTo("");
      setPriority("Medium"); setStartAt(""); setEndAt(""); setLocation(""); setAttendees("");
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
          placeholder={
            type === "Task" ? "נושא המשימה"
            : type === "Event" ? "נושא האירוע"
            : "כותרת שיחה (אופציונלי)"
          }
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
          dir="auto"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          type === "Comment" ? "כתוב הערה..."
          : type === "Task" ? "תיאור (אופציונלי)"
          : type === "Event" ? "פרטי האירוע (אופציונלי)"
          : "פרטי השיחה..."
        }
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

      {type === "Event" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <label className="text-gray-600">התחלה:
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
              className="block w-full mt-0.5 px-1.5 py-0.5 border border-gray-200 rounded" dir="ltr" />
          </label>
          <label className="text-gray-600">סיום:
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
              className="block w-full mt-0.5 px-1.5 py-0.5 border border-gray-200 rounded" dir="ltr" />
          </label>
          <label className="text-gray-600">מיקום:
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="חדר ישיבות / כתובת / online"
              className="block w-full mt-0.5 px-1.5 py-0.5 border border-gray-200 rounded" dir="auto" />
          </label>
          <label className="text-gray-600">משתתפים:
            <input type="text" value={attendees} onChange={(e) => setAttendees(e.target.value)}
              placeholder="שמות, מופרדים בפסיק"
              className="block w-full mt-0.5 px-1.5 py-0.5 border border-gray-200 rounded" dir="auto" />
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
          {type === "Comment" ? "שלח"
            : type === "Task" ? "צור משימה"
            : type === "Event" ? "צור אירוע"
            : "תעד שיחה"}
        </button>
      </div>
    </div>
  );
}
