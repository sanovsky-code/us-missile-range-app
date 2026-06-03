"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, ExternalLink } from "lucide-react";
import { SiteTaskWithSite, TASK_STATUSES, TASK_PRIORITIES, TaskStatus, TaskPriority } from "@/lib/types";

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

export default function ManagementPage() {
  const [tasks, setTasks] = useState<SiteTaskWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "All">("All");

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = await res.json();
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const updateStatus = async (id: number, status: TaskStatus) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await reload();
  };

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "All") list = list.filter((t) => t.priority === priorityFilter);
    return list;
  }, [tasks, statusFilter, priorityFilter]);

  const counts = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = { "Open": 0, "In Progress": 0, "Done": 0, "Cancelled": 0 };
    for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    return byStatus;
  }, [tasks]);

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">ניהול משימות</h1>
            <span className="text-sm text-gray-500">({tasks.length} סה&quot;כ)</span>
          </div>
        </div>

        {/* Status summary tiles */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((current) => current === s ? "All" : s)}
              className={`text-right p-3 rounded-lg border transition-all ${statusBg[s]} ${
                statusFilter === s ? "ring-2 ring-offset-2 ring-blue-400" : ""
              }`}
            >
              <p className="text-2xl font-bold">{counts[s]}</p>
              <p className="text-xs">{statusHebrew[s]}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">סטטוס:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "All")}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="All">הכל</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{statusHebrew[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">עדיפות:</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "All")}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="All">הכל</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{priorityHebrew[p]}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 ml-auto">מציג {filtered.length} משימות</p>
        </div>

        {/* Tasks table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>אין משימות מתאימות לסינון.</p>
              <p className="text-xs mt-1">צור משימה חדשה מתוך עמוד אתר.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">כותרת</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">אתר</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">עדיפות</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">יעד</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-gray-500 truncate max-w-md">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/site/${t.site_id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        dir="ltr"
                        style={{ textAlign: "left" }}
                      >
                        {t.site_name}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      <p className="text-xs text-gray-500" dir="ltr" style={{ textAlign: "left" }}>{t.country}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${priorityBg[t.priority]}`}>
                        {priorityHebrew[t.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {formatDate(t.due_date)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={t.status}
                        onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                        className={`text-xs px-2 py-1 rounded-md border ${statusBg[t.status]} cursor-pointer`}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>{statusHebrew[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
