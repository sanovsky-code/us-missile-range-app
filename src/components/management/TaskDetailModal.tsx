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
import { Loader2, X, ExternalLink, History, Calendar, User, Building2, Users, CheckCircle2, AlertCircle, Check } from "lucide-react";
import type { SiteTimelineActivity, TaskStatus, TaskPriority, TaskParentKind } from "@/lib/types";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/types";

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
  /** Whether this task lives in site_timeline_activities (open from a Site)
   * or contact_timeline_activities (open from a CRM Contact). Drives the
   * API endpoint base, the parent link href, and the origin badge. */
  kind: TaskParentKind;
  /** Parent identifier — site_id for kind="site", stringified contact id
   * for kind="contact". */
  parentId: string;
  /** Parent display name — site_name or contact full_name. */
  parentName: string;
  /** Secondary parent label — country for sites, organization for contacts. */
  parentSubtitle?: string;
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
  activityId, kind, parentId, parentName, parentSubtitle, onClose, onChanged,
}: Props) {
  // Resolve the API base + parent navigation href from the kind. Both
  // backends expose the same { activity, history } shape on GET and the
  // same PATCH body schema, so the rest of the modal is identical.
  const apiBase = kind === "site" ? "/api/activities" : "/api/contact-activities";
  const parentHref = kind === "site" ? `/site/${parentId}` : `/contacts/${parentId}`;
  const parentIcon = kind === "site" ? <Building2 className="w-3 h-3" /> : <Users className="w-3 h-3" />;
  const originLabel = kind === "site" ? "אתר" : "איש קשר";
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Timestamp of the last successful save. Drives the "✓ נשמר HH:MM"
  // toast that flashes for ~2s so the operator can see the save landed.
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${activityId}`, { cache: "no-store" });
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

  /** Generic field-level PATCH. Used for status, priority, due_date, and
   * assigned_to. Empty-string due_date / assigned_to are normalized to
   * null so the column can be cleared from the UI. */
  const patchField = async (
    patch: Partial<{
      status: TaskStatus;
      priority: TaskPriority;
      due_date: string | null;
      assigned_to: string | null;
    }>,
  ) => {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${activityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await reload();
      onChanged?.();
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // Auto-hide the "✓ נשמר" toast after 2s.
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  // assigned_to is a free-text field — we draft it locally and commit on
  // blur or Enter so the user can type freely without firing a PATCH on
  // every keystroke. Escape reverts to the saved value.
  const [assignedDraft, setAssignedDraft] = useState<string>("");
  useEffect(() => { setAssignedDraft(data?.activity.assigned_to ?? ""); }, [data]);

  const commitAssigned = () => {
    const normalized = assignedDraft.trim();
    const current = (data?.activity.assigned_to ?? "").trim();
    if (normalized === current) return;
    patchField({ assigned_to: normalized || null });
  };

  /**
   * Wraps the parent onClose with a "flush draft first" guard. If the
   * operator typed in משויך and is now closing the modal without first
   * blurring the input, we still want the save to land — otherwise the
   * change is silently dropped. We fire-and-forget the PATCH and let the
   * parent's onChanged() reload the list when it resolves.
   */
  const handleClose = () => {
    const draft = assignedDraft.trim();
    const current = (data?.activity.assigned_to ?? "").trim();
    if (data && draft !== current) {
      fetch(`${apiBase}/${activityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: draft || null }),
      }).then(() => onChanged?.()).catch(() => { /* swallow — modal is gone */ });
    }
    onClose();
  };

  // Close on Escape, routed through handleClose so any pending draft is
  // flushed before the modal unmounts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, assignedDraft, data]);

  const task = data?.activity;
  const history = data?.history ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
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
              <span className={
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold " +
                (kind === "site" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700")
              }>{originLabel}</span>
              <Link
                href={parentHref}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                dir="auto"
              >
                {parentIcon}
                {parentName}
                {parentSubtitle && <span className="text-gray-400">({parentSubtitle})</span>}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 break-words" dir="auto">
              {loading ? "טוען..." : (task?.subject ?? "—")}
            </h2>
            {/* Save-state pill: in-flight spinner OR last-saved confirmation. */}
            <div className="mt-1 h-5">
              {updating ? (
                <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  שומר...
                </span>
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                  <Check className="w-3 h-3" />
                  נשמר {savedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
              {/* Metadata grid — every field except "נוצר על־ידי" and
                 "הושלם" is inline-editable. Saves fire on change for
                 selects/date inputs and on blur/Enter for the text input. */}
              <section className="grid grid-cols-2 gap-3 text-sm">
                <Field icon={<History className="w-3.5 h-3.5" />} label="סטטוס">
                  <div className="flex items-center gap-2">
                    <select
                      value={task.status ?? "Open"}
                      disabled={updating}
                      onChange={(e) => patchField({ status: e.target.value as TaskStatus })}
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
                  <select
                    value={task.priority ?? "Medium"}
                    disabled={updating}
                    onChange={(e) => patchField({ priority: e.target.value as TaskPriority })}
                    className={
                      "text-xs px-2 py-1 rounded-md border bg-white" +
                      (updating ? " opacity-50 cursor-wait" : " cursor-pointer")
                    }
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_HEBREW[p] ?? p}</option>
                    ))}
                  </select>
                </Field>

                <Field icon={<Calendar className="w-3.5 h-3.5" />} label="יעד">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={normalizeDateForInput(task.due_date)}
                      disabled={updating}
                      onChange={(e) => patchField({ due_date: e.target.value || null })}
                      className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white"
                      dir="ltr"
                    />
                    {task.due_date && !updating && (
                      <button
                        type="button"
                        onClick={() => patchField({ due_date: null })}
                        className="text-xs text-gray-500 hover:text-red-600"
                        title="נקה תאריך יעד"
                      >
                        נקה
                      </button>
                    )}
                  </div>
                </Field>

                <Field icon={<User className="w-3.5 h-3.5" />} label="משויך">
                  <input
                    type="text"
                    value={assignedDraft}
                    disabled={updating}
                    onChange={(e) => setAssignedDraft(e.target.value)}
                    onBlur={commitAssigned}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") {
                        setAssignedDraft(task.assigned_to ?? "");
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="—"
                    className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white w-full"
                  />
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
            href={kind === "site" ? `${parentHref}#timeline` : parentHref}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-700 rounded-md text-gray-700"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {kind === "site" ? "פתח באתר" : "פתח באיש קשר"}
          </Link>
          <button
            type="button"
            onClick={handleClose}
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

/** Convert whatever the DB stored (YYYY-MM-DD or an ISO timestamp) into
 * the YYYY-MM-DD form an <input type="date"> requires. Empty string when
 * the field is unset, so React keeps the input controlled. */
function normalizeDateForInput(iso?: string): string {
  if (!iso) return "";
  // Already YYYY-MM-DD? leave alone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Use local timezone components so the picker shows the user-meaningful day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
