"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare, ClipboardList, History, Send, Plus, Loader2, X,
} from "lucide-react";
import {
  ActivityType, SiteTimelineActivity, TASK_PRIORITIES, TASK_STATUSES, TaskPriority, TaskStatus,
} from "@/lib/types";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  siteId: string;
}

const ACTIVITY_TYPE_HEBREW: Record<ActivityType, string> = {
  "Comment": "הערה",
  "Task": "משימה",
  "Task Update": "עדכון משימה",
};

const STATUS_HEBREW: Record<TaskStatus, string> = {
  "Open": "פתוח",
  "In Progress": "בטיפול",
  "Done": "הושלם",
  "Cancelled": "בוטל",
};
const PRIORITY_HEBREW: Record<TaskPriority, string> = {
  "Low": "נמוכה",
  "Medium": "בינונית",
  "High": "גבוהה",
};

const STATUS_CLS: Record<TaskStatus, string> = {
  "Open": "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Done": "bg-green-50 text-green-700 border-green-200",
  "Cancelled": "bg-gray-50 text-gray-500 border-gray-200",
};
const PRIORITY_CLS: Record<TaskPriority, string> = {
  "Low": "bg-gray-100 text-gray-600",
  "Medium": "bg-blue-100 text-blue-700",
  "High": "bg-red-100 text-red-700",
};

// Per-type colors for the timeline card border and the type badge, so a
// Comment / Task / Task Update is identifiable at a glance.
const TYPE_BORDER_CLS: Record<ActivityType, string> = {
  "Comment": "border-blue-100",
  "Task": "border-indigo-100",
  "Task Update": "border-gray-100",
};
const TYPE_CHIP_CLS: Record<ActivityType, string> = {
  "Comment": "bg-blue-50 text-blue-700",
  "Task": "bg-indigo-50 text-indigo-700",
  "Task Update": "bg-gray-100 text-gray-600",
};

const ACTIVITY_TYPE_FILTERS: Array<{ value: ActivityType | "all"; label: string }> = [
  { value: "all", label: "הכל" },
  { value: "Comment", label: "הערות" },
  { value: "Task", label: "משימות" },
  { value: "Task Update", label: "היסטוריה" },
];

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return iso; }
}

function ActivityIcon({ type }: { type: ActivityType }) {
  const iconCls = "w-4 h-4";
  if (type === "Comment") return <MessageSquare className={`${iconCls} text-blue-500`} />;
  if (type === "Task") return <ClipboardList className={`${iconCls} text-indigo-500`} />;
  return <History className={`${iconCls} text-gray-400`} />;
}

export default function ActivityTimeline({ siteId }: Props) {
  const { currentUser } = useCurrentUser();
  const [activities, setActivities] = useState<SiteTimelineActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [formOpen, setFormOpen] = useState<"Comment" | "Task" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comment form state
  const [commentBody, setCommentBody] = useState("");

  // Task form state
  const [taskSubject, setTaskSubject] = useState("");
  const [taskBody, setTaskBody] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("Medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/activities`, { cache: "no-store" });
      const data = await res.json();
      setActivities(data.activities || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<ActivityType | "all", number> = {
      all: activities.length, "Comment": 0, "Task": 0, "Task Update": 0,
    };
    for (const a of activities) c[a.activity_type] = (c[a.activity_type] ?? 0) + 1;
    return c;
  }, [activities]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return activities;
    return activities.filter((a) => a.activity_type === typeFilter);
  }, [activities, typeFilter]);

  const submitComment = async () => {
    if (!commentBody.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "Comment",
          subject: "Comment added",
          body: commentBody,
          created_by: currentUser || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setCommentBody(""); setFormOpen(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  };

  const submitTask = async () => {
    if (!taskSubject.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "Task",
          subject: taskSubject,
          body: taskBody,
          priority: taskPriority,
          due_date: taskDueDate || undefined,
          assigned_to: taskAssignedTo || undefined,
          created_by: currentUser || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setTaskSubject(""); setTaskBody(""); setTaskPriority("Medium");
      setTaskDueDate(""); setTaskAssignedTo("");
      setFormOpen(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (id: number, status: TaskStatus) => {
    await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, created_by: currentUser || undefined }),
    });
    await reload();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900">ציר זמן פעילויות</h2>
          <span className="text-sm text-gray-500">({activities.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFormOpen(formOpen === "Comment" ? null : "Comment")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50"
          >
            <MessageSquare className="w-4 h-4" /> הערה חדשה
          </button>
          <button
            onClick={() => setFormOpen(formOpen === "Task" ? null : "Task")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> משימה חדשה
          </button>
        </div>
      </div>

      {/* Quick-add forms */}
      {formOpen === "Comment" && (
        <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> הערה חדשה
            </h3>
            <button onClick={() => setFormOpen(null)} className="text-blue-700 hover:text-blue-900">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="כתוב את ההערה..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={submitComment}
              disabled={submitting || !commentBody.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שמור
            </button>
          </div>
        </div>
      )}

      {formOpen === "Task" && (
        <div className="mb-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> משימה חדשה
            </h3>
            <button onClick={() => setFormOpen(null)} className="text-indigo-700 hover:text-indigo-900">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={taskSubject}
            onChange={(e) => setTaskSubject(e.target.value)}
            placeholder="כותרת המשימה"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={taskBody}
            onChange={(e) => setTaskBody(e.target.value)}
            placeholder="תיאור (אופציונלי)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">עדיפות</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
              >
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_HEBREW[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך יעד</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">משויך ל-</label>
              <input
                value={taskAssignedTo}
                onChange={(e) => setTaskAssignedTo(e.target.value)}
                placeholder="שם (אופציונלי)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={submitTask}
              disabled={submitting || !taskSubject.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "צור משימה"}
            </button>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap border-b border-gray-100 pb-3">
        {ACTIVITY_TYPE_FILTERS.map((f) => {
          const count = counts[f.value] ?? 0;
          const active = typeFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          {typeFilter === "all" ? "עדיין אין פעילויות לאתר זה." : "אין פעילויות מהסוג הזה."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => {
            // Salesforce-style: hide the auto-generated "Comment added" subject
            // when there is body text to show, since the type chip already
            // identifies it as a comment. Same idea for Task Update rows: the
            // body ("Status changed from X to Y") IS the meaningful content.
            const subjectIsRedundant =
              (a.activity_type === "Comment" || a.activity_type === "Task Update") &&
              !!a.body;
            return (
            <li key={a.id} className={`border rounded-lg p-3 bg-white ${TYPE_BORDER_CLS[a.activity_type]}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <ActivityIcon type={a.activity_type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_CHIP_CLS[a.activity_type]}`}>
                          {ACTIVITY_TYPE_HEBREW[a.activity_type]}
                        </span>
                        {a.priority && a.activity_type === "Task" && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_CLS[a.priority]}`}>
                            {PRIORITY_HEBREW[a.priority]}
                          </span>
                        )}
                      </div>
                      {!subjectIsRedundant && (
                        <p className="text-sm font-medium text-gray-900">{a.subject}</p>
                      )}
                      {a.body && (
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{a.body}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
                        <span>{formatDateTime(a.created_at)}</span>
                        {a.due_date && (
                          <span>· יעד: {formatDate(a.due_date)}</span>
                        )}
                        {a.assigned_to && (
                          <span>· {a.assigned_to}</span>
                        )}
                        {a.created_by && (
                          <span>· ע&quot;י {a.created_by}</span>
                        )}
                        {a.completed_at && (
                          <span>· הושלם: {formatDateTime(a.completed_at)}</span>
                        )}
                      </div>
                    </div>
                    {a.activity_type === "Task" && a.status && (
                      <select
                        value={a.status}
                        onChange={(e) => changeStatus(a.id, e.target.value as TaskStatus)}
                        className={`text-xs px-2 py-1 rounded-md border ${STATUS_CLS[a.status]} cursor-pointer flex-shrink-0`}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_HEBREW[s]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
