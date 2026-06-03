"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Plus, Loader2 } from "lucide-react";
import { SiteTask, TASK_PRIORITIES, TASK_STATUSES, TaskPriority, TaskStatus } from "@/lib/types";

interface Props {
  siteId: string;
}

const statusHebrew: Record<TaskStatus, string> = {
  "Open": "פתוח",
  "In Progress": "בטיפול",
  "Done": "הושלם",
  "Cancelled": "בוטל",
};
const priorityHebrew: Record<TaskPriority, string> = {
  "Low": "נמוכה",
  "Medium": "בינונית",
  "High": "גבוהה",
};
const statusBg: Record<TaskStatus, string> = {
  "Open": "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Done": "bg-green-50 text-green-700 border-green-200",
  "Cancelled": "bg-gray-50 text-gray-500 border-gray-200",
};
const priorityBg: Record<TaskPriority, string> = {
  "Low": "bg-gray-100 text-gray-600",
  "Medium": "bg-blue-100 text-blue-700",
  "High": "bg-red-100 text-red-700",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TasksSection({ siteId }: Props) {
  const [tasks, setTasks] = useState<SiteTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/tasks`, { cache: "no-store" });
      const data = await res.json();
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priority,
          due_date: dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה ביצירת המשימה");
      setTitle(""); setDescription(""); setPriority("Medium"); setDueDate("");
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: number, status: TaskStatus) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await reload();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            משימות ({tasks.length})
          </h2>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> משימה חדשה
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50/40 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת המשימה"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור (אופציונלי)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">עדיפות</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{priorityHebrew[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך יעד</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
            >
              ביטול
            </button>
            <button
              onClick={submit}
              disabled={submitting || !title.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "צור משימה"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">אין משימות לאתר זה.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 text-sm">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{t.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full ${priorityBg[t.priority]}`}>
                      {priorityHebrew[t.priority]}
                    </span>
                    {t.due_date && <span>יעד: {formatDate(t.due_date)}</span>}
                  </div>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                  className={`text-xs px-2 py-1 rounded-md border ${statusBg[t.status]} cursor-pointer flex-shrink-0`}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{statusHebrew[s]}</option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
