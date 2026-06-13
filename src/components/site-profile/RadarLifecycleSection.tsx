"use client";

/**
 * Inline lifecycle timeline rendered inside a radar's expanded row in
 * RadarTable. Salesforce-style related list: header with count + "+
 * add" button, scrollable table of events, edit / delete affordances
 * per row. Fetches lazily — only loads when a parent row first expands
 * (RadarTable conditionally mounts this component).
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, Plus, Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
import type { RadarLifecycleEvent } from "@/lib/types";
import LifecycleEventFormModal from "./LifecycleEventFormModal";

interface Props {
  radarId: string;
  /** Callback so the parent RadarTable can refresh the lifecycle_count
   * chip on the row header after a CRUD action. */
  onCountChange?: (n: number) => void;
}

const EVENT_TYPE_CLS: Record<string, string> = {
  "Procurement specification": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Procurement award":         "bg-blue-50 text-blue-700 border-blue-200",
  "Contract award":            "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Delivery / modernization":  "bg-purple-50 text-purple-700 border-purple-200",
  "Acceptance":                "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Commissioning":             "bg-green-50 text-green-700 border-green-200",
  "Planned acquisition":       "bg-amber-50 text-amber-700 border-amber-200",
  "Historical reference":      "bg-gray-50 text-gray-700 border-gray-200",
  "Decommissioning":           "bg-rose-50 text-rose-700 border-rose-200",
  "Other":                     "bg-gray-50 text-gray-700 border-gray-200",
};

function eventTypeClass(t: string): string {
  return EVENT_TYPE_CLS[t] ?? EVENT_TYPE_CLS["Other"];
}

function eventWhen(e: RadarLifecycleEvent): string {
  if (e.event_date) return e.event_date;
  if (e.event_year) return String(e.event_year);
  return "—";
}

export default function RadarLifecycleSection({ radarId, onCountChange }: Props) {
  const [events, setEvents] = useState<RadarLifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<RadarLifecycleEvent | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/radars/${radarId}/lifecycle`, { cache: "no-store" });
      const j = await res.json();
      const list = (j.events ?? []) as RadarLifecycleEvent[];
      setEvents(list);
      onCountChange?.(list.length);
    } finally { setLoading(false); }
  }, [radarId, onCountChange]);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (ev: RadarLifecycleEvent) => {
    const label = ev.event_title || ev.event_type;
    if (!confirm(`למחוק את "${label}"?`)) return;
    const res = await fetch(`/api/lifecycle-events/${ev.event_id}`, { method: "DELETE" });
    if (res.ok) await reload();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg mt-3">
      <header className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-600" />
          <h4 className="text-sm font-semibold text-gray-900">מחזור חיים</h4>
          <span className="text-xs text-gray-400">({events.length})</span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
        <button onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md">
          <Plus className="w-3.5 h-3.5" /> אירוע חדש
        </button>
      </header>

      {events.length === 0 && !loading ? (
        <p className="text-xs text-gray-500 px-4 py-4 text-center">
          אין אירועי מחזור חיים. לחץ &quot;אירוע חדש&quot; כדי להוסיף.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-right px-3 py-2 font-semibold text-gray-600">מתי</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">סוג</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">כותרת</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Owner</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Supplier</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Value</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">מקורות</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event_id} className="border-b border-gray-100 hover:bg-sky-50/40">
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap" dir="ltr">{eventWhen(e)}</td>
                  <td className="px-3 py-2">
                    <span className={"inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border " + eventTypeClass(e.event_type)}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-900" dir="auto" title={e.event_description ?? ""}>
                    <div className="font-medium line-clamp-2">{e.event_title || <span className="text-gray-400">—</span>}</div>
                    {e.event_description && <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{e.event_description}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700" dir="auto">{e.authority_or_owner || "—"}</td>
                  <td className="px-3 py-2 text-gray-700" dir="auto">{e.supplier_or_contractor || "—"}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap" dir="ltr">
                    {e.disclosed_value
                      ? <span>{e.disclosed_value}{e.currency ? <span className="text-gray-400 mr-1"> {e.currency}</span> : null}</span>
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-700" dir="ltr">
                    {e.source_ids
                      ? e.source_ids.split(/,\s*/).filter(Boolean).map((sid) => (
                          <a key={sid} href={`/source/${sid}`}
                            className="inline-flex items-center gap-0.5 text-blue-700 hover:underline mr-1">
                            {sid}<ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(e)}
                        className="p-1 text-gray-400 hover:text-blue-700" title="ערוך">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(e)}
                        className="p-1 text-gray-400 hover:text-red-700" title="מחק">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCreate && (
        <LifecycleEventFormModal
          mode="create"
          radarId={radarId}
          onClose={() => setOpenCreate(false)}
          onSaved={async () => { setOpenCreate(false); await reload(); }}
        />
      )}
      {editing && (
        <LifecycleEventFormModal
          mode="edit"
          radarId={radarId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}
