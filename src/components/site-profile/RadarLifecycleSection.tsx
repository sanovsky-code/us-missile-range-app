"use client";

/**
 * Inline lifecycle timeline rendered inside a radar's expanded row in
 * RadarTable. Salesforce-style related list: header with count + "+
 * add" button, scrollable table of events, edit / delete affordances
 * per row. Fetches lazily — only loads when a parent row first expands
 * (RadarTable conditionally mounts this component).
 */
import React, { useCallback, useEffect, useState } from "react";
import { Clock, Plus, Pencil, Trash2, Loader2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
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
  // Per-row expand state: keys are event_ids of currently-expanded rows.
  // We track explicit set membership so toggling is O(1) and re-renders
  // only the row that changed.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                <th className="w-6 px-2 py-2"></th>
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
              {events.map((e) => {
                const isOpen = expanded.has(e.event_id);
                return (
                  <React.Fragment key={e.event_id}>
                    <tr
                      className="border-b border-gray-100 hover:bg-sky-50/40 cursor-pointer"
                      onClick={() => toggle(e.event_id)}
                    >
                      <td className="w-6 px-2 py-2 align-top">
                        {isOpen
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap" dir="ltr">{eventWhen(e)}</td>
                      <td className="px-3 py-2">
                        <span className={"inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border " + eventTypeClass(e.event_type)}>
                          {e.event_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900" dir="auto" title={e.event_description ?? ""}>
                        <div className="font-medium line-clamp-2">{e.event_title || <span className="text-gray-400">—</span>}</div>
                        {!isOpen && e.event_description && (
                          <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{e.event_description}</div>
                        )}
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
                                onClick={(ev) => ev.stopPropagation()}
                                className="inline-flex items-center gap-0.5 text-blue-700 hover:underline mr-1">
                                {sid}<ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ))
                          : "—"}
                      </td>
                      <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
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
                    {isOpen && (
                      <tr className="bg-sky-50/30 border-b border-gray-100">
                        <td colSpan={9} className="px-4 py-3">
                          <LifecycleDetailGrid event={e} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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


/**
 * Detail panel rendered under an expanded lifecycle row. Lays out every
 * column the table truncates (event_description, value_scope,
 * evidence_status, analyst_note, currency-with-amount, event_year
 * fallback, full source links) plus the audit footer. Two-column on
 * desktop, single column on narrow viewports.
 */
function LifecycleDetailGrid({ event: e }: { event: RadarLifecycleEvent }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
      <Field label="event_id">
        <span className="font-mono text-gray-700" dir="ltr">{e.event_id}</span>
      </Field>
      <Field label="מתי">
        <span dir="ltr">
          {e.event_date ?? "—"}
          {e.event_year && !e.event_date ? <span className="text-gray-500"> (שנה: {e.event_year})</span> : null}
        </span>
      </Field>
      <Field label="event_title" wide>
        <span dir="auto">{e.event_title || "—"}</span>
      </Field>
      <Field label="event_description" wide>
        {e.event_description
          ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed" dir="auto">{e.event_description}</p>
          : <span className="text-gray-400">—</span>}
      </Field>
      <Field label="authority / owner">
        <span dir="auto">{e.authority_or_owner || "—"}</span>
      </Field>
      <Field label="supplier / contractor">
        <span dir="auto">{e.supplier_or_contractor || "—"}</span>
      </Field>
      <Field label="disclosed_value">
        <span dir="ltr">
          {e.disclosed_value || "—"}
          {e.currency ? <span className="text-gray-500"> {e.currency}</span> : null}
        </span>
      </Field>
      <Field label="value_scope" wide>
        {e.value_scope
          ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed" dir="auto">{e.value_scope}</p>
          : <span className="text-gray-400">—</span>}
      </Field>
      <Field label="evidence_status" wide>
        {e.evidence_status
          ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed" dir="auto">{e.evidence_status}</p>
          : <span className="text-gray-400">—</span>}
      </Field>
      <Field label="source_ids" wide>
        {e.source_ids
          ? <div className="flex flex-wrap gap-1.5" dir="ltr">
              {e.source_ids.split(/,\s*/).filter(Boolean).map((sid) => (
                <a key={sid} href={`/source/${sid}`}
                   className="inline-flex items-center gap-0.5 text-blue-700 hover:underline">
                  {sid}<ExternalLink className="w-2.5 h-2.5" />
                </a>
              ))}
            </div>
          : <span className="text-gray-400">—</span>}
      </Field>
      <Field label="analyst_note" wide>
        {e.analyst_note
          ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed bg-amber-50/40 border border-amber-100 rounded p-2" dir="auto">{e.analyst_note}</p>
          : <span className="text-gray-400">—</span>}
      </Field>
      {(e.created_by || e.created_at || e.updated_by || e.updated_at) && (
        <Field label="audit" wide>
          <span className="text-[11px] text-gray-500">
            {e.created_by && <>נוצר ע&quot;י {e.created_by}</>}
            {e.created_at && <> · {fmtAuditTs(e.created_at)}</>}
            {e.updated_by && <> · עודכן ע&quot;י {e.updated_by}</>}
            {e.updated_at && <> · {fmtAuditTs(e.updated_at)}</>}
          </span>
        </Field>
      )}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

function fmtAuditTs(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
