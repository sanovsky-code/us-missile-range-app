"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, ExternalLink, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, Building2, Users } from "lucide-react";
import {
  UnifiedTaskRow, TaskParentKind, TASK_STATUSES, TASK_PRIORITIES, TaskStatus, TaskPriority,
} from "@/lib/types";
import TaskDetailModal from "@/components/management/TaskDetailModal";

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

const ACTIVE_STATUSES: TaskStatus[] = ["Open", "In Progress"];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return iso; }
}

export default function ManagementPage() {
  // Unified rows: tasks from BOTH site_timeline_activities and
  // contact_timeline_activities, tagged with `parent_type`.
  const [tasks, setTasks] = useState<UnifiedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "All">("All");
  const [parentFilter, setParentFilter] = useState<string>("All");      // "All" | parent_type:parent_id
  const [originFilter, setOriginFilter] = useState<TaskParentKind | "All">("All");
  // Which task is open in the detail modal (null = closed). The modal is
  // polymorphic over parent kind, so we keep the full parent context here.
  const [openTask, setOpenTask] = useState<{
    id: number;
    kind: TaskParentKind;
    parent_id: string;
    parent_name: string;
    parent_subtitle?: string;
  } | null>(null);
  // Column sort state. null = the API's default order (due-date ascending
  // with nulls last). Clicking a header cycles: asc → desc → null.
  type SortKey = "subject" | "parent_name" | "priority" | "due_date" | "assigned_to" | "status";
  type SortDir = "asc" | "desc";
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const toggleSort = (key: SortKey) => {
    setSort((curr) => {
      if (!curr || curr.key !== key) return { key, dir: "asc" };
      if (curr.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears sort
    });
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Default: only active (Open + In Progress). Toggle to include closed.
      const params = new URLSearchParams();
      const statuses = showCompleted
        ? TASK_STATUSES
        : ACTIVE_STATUSES;
      statuses.forEach((s) => params.append("status", s));
      const res = await fetch(`/api/activities?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  }, [showCompleted]);

  useEffect(() => { reload(); }, [reload]);

  // PATCH endpoint depends on whether the row belongs to a site or a contact.
  const patchUrl = (t: UnifiedTaskRow) => (
    t.parent_type === "site"
      ? `/api/activities/${t.id}`
      : `/api/contact-activities/${t.id}`
  );

  const changeStatus = async (t: UnifiedTaskRow, status: TaskStatus) => {
    await fetch(patchUrl(t), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await reload();
  };

  const markDone = (t: UnifiedTaskRow) => changeStatus(t, "Done");

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "All") list = list.filter((t) => t.priority === priorityFilter);
    if (originFilter !== "All") list = list.filter((t) => t.parent_type === originFilter);
    if (parentFilter !== "All") {
      // parentFilter encodes "type:id" so two entities with the same id but
      // different kinds (rare but possible) stay distinct.
      list = list.filter((t) => `${t.parent_type}:${t.parent_id}` === parentFilter);
    }
    if (!sort) return list;
    // Priority and status get domain orderings instead of alphabetical.
    // Empty/null values always sink to the bottom regardless of direction
    // so the rows the user is missing data on don't dominate the top.
    const priorityRank: Record<TaskPriority, number> = { Low: 0, Medium: 1, High: 2 };
    const statusRank: Record<TaskStatus, number> = { Open: 0, "In Progress": 1, Done: 2, Cancelled: 3 };
    const compare = (a: UnifiedTaskRow, b: UnifiedTaskRow): number => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const nullsLast = (av: unknown, bv: unknown): number | null => {
        const aEmpty = av === null || av === undefined || av === "";
        const bEmpty = bv === null || bv === undefined || bv === "";
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        return null;
      };
      switch (sort.key) {
        case "subject":      return dir * (a.subject ?? "").localeCompare(b.subject ?? "", "he");
        case "parent_name":  return dir * (a.parent_name ?? "").localeCompare(b.parent_name ?? "", "he");
        case "assigned_to": {
          const ne = nullsLast(a.assigned_to, b.assigned_to);
          if (ne !== null) return ne;
          return dir * (a.assigned_to ?? "").localeCompare(b.assigned_to ?? "", "he");
        }
        case "due_date": {
          const ne = nullsLast(a.due_date, b.due_date);
          if (ne !== null) return ne;
          return dir * (new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
        }
        case "priority": {
          const ne = nullsLast(a.priority, b.priority);
          if (ne !== null) return ne;
          return dir * (priorityRank[a.priority as TaskPriority] - priorityRank[b.priority as TaskPriority]);
        }
        case "status": {
          const ne = nullsLast(a.status, b.status);
          if (ne !== null) return ne;
          return dir * (statusRank[a.status as TaskStatus] - statusRank[b.status as TaskStatus]);
        }
      }
    };
    return [...list].sort(compare);
  }, [tasks, statusFilter, priorityFilter, originFilter, parentFilter, sort]);

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { "Open": 0, "In Progress": 0, "Done": 0, "Cancelled": 0 };
    for (const t of tasks) if (t.status) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tasks]);

  // Unique parents across both kinds. Encoded as "type:id" so the dropdown
  // value stays globally unique even if a site and a contact share a number.
  const parents = useMemo(() => {
    const seen = new Map<string, { kind: TaskParentKind; name: string }>();
    for (const t of tasks) {
      const key = `${t.parent_type}:${t.parent_id}`;
      if (!seen.has(key)) seen.set(key, { kind: t.parent_type, name: t.parent_name });
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name, "he"));
  }, [tasks]);
  const visibleParents = useMemo(
    () => originFilter === "All" ? parents : parents.filter(([, v]) => v.kind === originFilter),
    [parents, originFilter],
  );

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">ניהול משימות</h1>
            <span className="text-sm text-gray-500">({tasks.length})</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300"
            />
            הצג גם משימות סגורות
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((curr) => curr === s ? "All" : s)}
              className={`text-right p-3 rounded-lg border transition-all ${STATUS_CLS[s]} ${
                statusFilter === s ? "ring-2 ring-offset-2 ring-blue-400" : ""
              }`}
            >
              <p className="text-2xl font-bold">{counts[s] ?? 0}</p>
              <p className="text-xs">{STATUS_HEBREW[s]}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">סטטוס:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "All")}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="All">הכל</option>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_HEBREW[s]}</option>)}
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
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_HEBREW[p]}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">מקור:</label>
            <select
              value={originFilter}
              onChange={(e) => {
                setOriginFilter(e.target.value as TaskParentKind | "All");
                setParentFilter("All");   // reset parent filter when origin changes
              }}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="All">הכל</option>
              <option value="site">אתרים</option>
              <option value="contact">אנשי קשר</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">
              {originFilter === "contact" ? "איש קשר:" : originFilter === "site" ? "אתר:" : "אתר / איש קשר:"}
            </label>
            <select
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white max-w-xs"
            >
              <option value="All">הכל</option>
              {visibleParents.map(([key, v]) => (
                <option key={key} value={key}>{v.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 ml-auto">מציג {filtered.length}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>{showCompleted ? "אין משימות מתאימות לסינון." : "אין משימות פעילות."}</p>
              <p className="text-xs mt-1">צור משימה חדשה מתוך עמוד אתר.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <SortHeader label="כותרת"            sortKey="subject"     sort={sort} onToggle={toggleSort} />
                  <SortHeader label="אתר / איש קשר"  sortKey="parent_name" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="עדיפות"          sortKey="priority"    sort={sort} onToggle={toggleSort} />
                  <SortHeader label="יעד"              sortKey="due_date"    sort={sort} onToggle={toggleSort} />
                  <SortHeader label="משויך"           sortKey="assigned_to" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="סטטוס"           sortKey="status"      sort={sort} onToggle={toggleSort} />
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isContact = t.parent_type === "contact";
                  const parentHref = isContact ? `/contacts/${t.parent_id}` : `/site/${t.parent_id}`;
                  return (
                  <tr key={`${t.parent_type}-${t.id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        {/* Origin badge — instantly identifies where the task came from. */}
                        <span className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold " +
                          (isContact ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700")
                        } title={isContact ? "משימה ממסך איש קשר" : "משימה ממסך אתר"}>
                          {isContact ? <Users className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                          {isContact ? "איש קשר" : "אתר"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenTask({
                          id: t.id,
                          kind: t.parent_type,
                          parent_id: t.parent_id,
                          parent_name: t.parent_name,
                          parent_subtitle: t.parent_subtitle,
                        })}
                        className="font-medium text-gray-900 hover:text-blue-700 hover:underline text-right"
                        title="פתח פרטי משימה והיסטוריה"
                      >
                        {t.subject}
                      </button>
                      {t.body && (
                        <p className="text-xs text-gray-500 truncate max-w-md">{t.body}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={parentHref}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        dir="auto"
                      >
                        {t.parent_name}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      {t.parent_subtitle && (
                        <p className="text-xs text-gray-500" dir="auto">{t.parent_subtitle}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.priority && (
                        <span className={`text-xs px-2 py-1 rounded-full ${PRIORITY_CLS[t.priority]}`}>
                          {PRIORITY_HEBREW[t.priority]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{formatDate(t.due_date)}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{t.assigned_to ?? "—"}</td>
                    <td className="px-4 py-3">
                      {t.status && (
                        <select
                          value={t.status}
                          onChange={(e) => changeStatus(t, e.target.value as TaskStatus)}
                          className={`text-xs px-2 py-1 rounded-md border ${STATUS_CLS[t.status]} cursor-pointer`}
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_HEBREW[s]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.status !== "Done" && t.status !== "Cancelled" && (
                        <button
                          onClick={() => markDone(t)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-md border border-green-200"
                          title="סמן כהושלם"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> סיים
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openTask && (
        <TaskDetailModal
          activityId={openTask.id}
          kind={openTask.kind}
          parentId={openTask.parent_id}
          parentName={openTask.parent_name}
          parentSubtitle={openTask.parent_subtitle}
          onClose={() => setOpenTask(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}


/**
 * Clickable column header. Shows a faded up/down icon by default, and a
 * filled directional icon when this is the active sort column.
 *
 * Click cycle (handled by toggleSort in the parent):
 *   inactive  → asc
 *   asc       → desc
 *   desc      → null (default order)
 */
type _SortKey = "subject" | "parent_name" | "priority" | "due_date" | "assigned_to" | "status";

function SortHeader({
  label, sortKey, sort, onToggle,
}: {
  label: string;
  sortKey: _SortKey;
  sort: { key: _SortKey; dir: "asc" | "desc" } | null;
  onToggle: (key: _SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th className="text-right px-4 py-3 text-xs font-bold uppercase">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={
          "inline-flex items-center gap-1 select-none " +
          (active ? "text-blue-700" : "text-gray-600 hover:text-gray-900")
        }
        title={
          dir === "asc" ? `ממוין לפי ${label} — לחיצה להפיכת הסדר`
          : dir === "desc" ? `ממוין לפי ${label} (יורד) — לחיצה לאיפוס`
          : `מיון לפי ${label}`
        }
      >
        {label}
        <Icon className={"w-3.5 h-3.5 " + (active ? "" : "opacity-40")} />
      </button>
    </th>
  );
}
