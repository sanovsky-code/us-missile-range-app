"use client";

/**
 * Salesforce-style "Systems" related list on the Site profile page.
 *
 * Mirrors the columns the operator pasted in the screenshot
 * (system_id, system_name, system_category, purpose, owner, operator,
 * manufacturer, operational_status, public_description, confidence_level,
 * last_verified_date, source_id, citations) and supports inline add /
 * edit / delete. Differs from RadarTable (read-only, Excel-only) because
 * Systems can be both imported AND user-managed.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { Source, System } from "@/lib/types";
import { ConfidenceBadge, StatusBadge } from "@/components/ui/Badge";
import SystemFormModal from "./SystemFormModal";

interface Props {
  siteId: string;
  /** Initial systems from the server payload — keeps SSR fast. The component
   * re-fetches via /api/sites/:siteId/systems whenever a CRUD action lands. */
  initialSystems: System[];
  sources?: Source[];
}

const CATEGORY_CHIP_CLS: Record<string, string> = {
  "Optical Tracking":            "bg-blue-50 text-blue-700 border-blue-200",
  "Telemetry / Range Safety":    "bg-purple-50 text-purple-700 border-purple-200",
  "Electronic Warfare":          "bg-red-50 text-red-700 border-red-200",
  "Communications":              "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Command & Control":           "bg-amber-50 text-amber-700 border-amber-200",
  "Test Instrumentation":        "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Weapons Test":                "bg-rose-50 text-rose-700 border-rose-200",
  "Other":                       "bg-gray-50 text-gray-700 border-gray-200",
};

function categoryClass(c: string): string {
  return CATEGORY_CHIP_CLS[c] ?? CATEGORY_CHIP_CLS["Other"];
}

export default function SystemsTable({ siteId, initialSystems, sources }: Props) {
  void sources; // reserved for future CitedText rendering of public_description
  const [systems, setSystems] = useState<System[]>(initialSystems);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<System | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/systems`, { cache: "no-store" });
      const j = await res.json();
      setSystems(j.systems ?? []);
    } finally { setLoading(false); }
  }, [siteId]);

  // Keep local state in sync when the SSR-provided list changes (e.g. after
  // router.refresh() following a server-component re-render).
  useEffect(() => { setSystems(initialSystems); }, [initialSystems]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = async (sys: System) => {
    if (!confirm(`למחוק את "${sys.system_name}"?`)) return;
    const res = await fetch(`/api/systems/${sys.system_id}`, { method: "DELETE" });
    if (res.ok) await reload();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">מערכות באתר ({systems.length})</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <button
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
        >
          <Plus className="w-4 h-4" /> מערכת חדשה
        </button>
      </div>

      {systems.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          אין רשומות מערכות זמינות לאתר זה. לחץ &quot;מערכת חדשה&quot; כדי להוסיף.
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">שם המערכת</th>
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">קטגוריה</th>
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">Owner</th>
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">Operator</th>
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">סטטוס</th>
                <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <SystemRow
                  key={s.system_id}
                  system={s}
                  isExpanded={expanded.has(s.system_id)}
                  onToggle={() => toggle(s.system_id)}
                  onEdit={() => setEditing(s)}
                  onDelete={() => remove(s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">לחץ על שורה כדי להציג פרטים מלאים.</p>

      {openCreate && (
        <SystemFormModal
          mode="create"
          siteId={siteId}
          onClose={() => setOpenCreate(false)}
          onSaved={async () => { setOpenCreate(false); await reload(); }}
        />
      )}
      {editing && (
        <SystemFormModal
          mode="edit"
          siteId={siteId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}


function SystemRow({
  system, isExpanded, onToggle, onEdit, onDelete,
}: {
  system: System;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-emerald-50/40 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            <div>
              <div className="font-semibold text-gray-900" dir="auto">{system.system_name}</div>
              <div className="text-[11px] text-gray-400" dir="ltr">{system.system_id}</div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border " + categoryClass(system.system_category)}>
            {system.system_category}
          </span>
        </td>
        <td className="py-3 px-4 text-gray-700" dir="auto">{system.owner || "—"}</td>
        <td className="py-3 px-4 text-gray-700" dir="auto">{system.operator || "—"}</td>
        <td className="py-3 px-4">
          <StatusBadge status={system.operational_status} />
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-700" title="ערוך">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-700" title="מחק">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50/80 border-b border-gray-200">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Detail label="Purpose" value={system.purpose} />
              <Detail label="Manufacturer" value={system.manufacturer} />
              <Detail label="Public Description" value={system.public_description} wide />
              <Detail label="רמת מהימנות"><ConfidenceBadge level={system.confidence_level} /></Detail>
              <Detail label="Last verified" value={system.last_verified_date} />
              <Detail label="Source ID" value={system.source_id} />
              <Detail label="Citations" value={system.citations} />
              <Detail label="Record status" value={system.record_status} />
              {(system.created_by || system.updated_by) && (
                <Detail label="Audit">
                  <span className="text-xs text-gray-500">
                    {system.created_by && <>נוצר על־ידי {system.created_by}</>}
                    {system.updated_by && <> · עודכן על־ידי {system.updated_by}</>}
                  </span>
                </Detail>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value, children, wide }: {
  label: string; value?: string; children?: React.ReactNode; wide?: boolean;
}) {
  if (!value && !children) return null;
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase text-gray-500 font-semibold">{label}</div>
      <div className="text-gray-900 mt-0.5" dir="auto">
        {children ?? value}
      </div>
    </div>
  );
}
