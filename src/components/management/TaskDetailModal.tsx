"use client";

/**
 * Read-only detail view for a single Task, opened from the Management
 * page when the operator clicks the task title.
 *
 * Shows:
 *   - The task's subject + body
 *   - Metadata grid (priority, due date, assignee, created_by/at,
 *     completed_at, linked Site)
 *   - History feed: every "Task Update" row that points back at this
 *     task via parent_activity_id, oldest first.
 *
 * The status dropdown is also available here, so the operator can flip
 * status without closing the modal; doing so triggers an onChanged()
 * callback which the Management page uses to refresh its list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, X, ExternalLink, History, Calendar, User, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import type { SiteTimelineActivity, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/types";

const STATUS_HEBREW: Record<TaskStatus, string> = {
  "Open": "פתוח",
  "In Progress": "בטיפול",
  "Done": "הושלם",
  "Cancelled": "בוטל",
};
const PRIORITY_HEBREW: Record<string, string> = {
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

interface Props {
  activityId: number;
  /** Site context shown next to the task. Passed in from the Management
   * row so we don't need to look it up again here. */
  siteId: string;
  siteName: string;
  country?: string;
  onClose: () => void;
  /** Called after the operator changes status inside the modal so the
   * parent page can re-fetch its task list. */
  onChanged?: () => void;
}

interface DetailResponse {
  activity: SiteTimelineActivity;
  history: SiteTimelineActivity[];
}

export default function TaskDetailModal({
  activityId, siteId, siteName, country, onClose, onChanged,
}: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activityId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activityId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeStatus = async (newStatus: TaskStatus) => {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const task = data?.activity;
  const history = data?.history ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span className="font-mono">#{activityId}</span>
              <span>·</span>
              <Link
                href={`/site/${siteId}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                dir="ltr"
              >
                <Building2 className="w-3 h-3" />
                {siteName}
                {country && <span className="text-gray-400">({country})</span>}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 break-words" dir="auto">
              {loading ? "טוען..." : (task?.subject ?? "—")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {loading && !task ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : task ? (
            <>
              {/* Metadata grid */}
              <section className="grid grid-cols-2 gap-3 text-sm">
                <Field icon={<History className="w-3.5 h-3.5" />} label="סטטוס">
                  <div className="flex items-center gap-2">
                    <select
                      value={task.status ?? "Open"}
                      disabled={updating}
                      onChange={(e) => changeStatus(e.target.value as TaskStatus)}
                      className={
                        "text-xs px-2 py-1 rounded-md border " +
                        (STATUS_CLS[task.status as TaskStatus] ?? "bg-gray-50 border-gray-200") +
                        (updating ? " opacity-50 cursor-wait" : " cursor-pointer")
                      }
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_HEBREW[s]}</option>
                      ))}
                    </select>
                    {updating && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                  </div>
                </Field>
                <Field icon={<AlertCircle className="w-3.5 h-3.5" />} label="עדיפות">
                  {task.priority ? (PRIORITY_HEBREW[task.priority] ?? task.priority) : "—"}
                </Field>
                <Field icon={<Calendar className="w-3.5 h-3.5" />} label="יעד">
                  {task.due_date ? formatDate(task.due_date) : "—"}
                </Field>
                <Field icon={<User className="w-3.5 h-3.5" />} label="משויך">
                  {task.assigned_to ?? "—"}
                </Field>
                <Field icon={<User className="w-3.5 h-3.5" />} label="נוצר על־ידי">
                  <span>
                    {task.created_by ?? "—"}
                    <span className="text-gray-400 mr-1 text-xs">· {formatDateTime(task.created_at)}</span>
                  </span>
                </Field>
                <Field icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="הושלם">
                  {task.completed_at ? formatDateTime(task.completed_at) : "—"}
                </Field>
              </section>

              {/* Body / description */}
              {task.body && (
                <section className="bg-gray-50/50 border border-gray-200 rounded-md p-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-1">תיאור</h3>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words" dir="auto">
                    {task.body}
                  </p>
                </section>
              )}

              {/* History feed */}
              <section>
                <h3 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <History className="w-3.5 h-3.5" />
                  היסטוריה ({history.length})
                </h3>
                {history.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">
                    אין רישומי היסטוריה. שינויי סטטוס יתועדו כאן.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {history.map((h) => (
                      <li key={h.id} className="border-r-2 border-blue-200 bg-blue-50/40 rounded-md p-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                          <span className="font-medium text-gray-700">{h.subject}</span>
                          <span>{formatDateTime(h.created_at)}</span>
                        </div>
                        {h.body && (
                          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap break-words" dir="auto">
                            {h.body}
                          </p>
                        )}
                        {h.created_by && (
                          <p className="text-xs text-gray-500 mt-1">על־ידי {h.created_by}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-200 bg-gray-50/50">
          <Link
            href={`/site/${siteId}#timeline`}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-700 rounded-md text-gray-700"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            פתח באתר
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            סגור
          </button>
        </footer>
      </div>
    </div>
  );
}


function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-2.5">
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch { return iso; }
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
