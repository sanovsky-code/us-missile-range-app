"use client";

/**
 * Per-activity field-change feed rendered inside an expanded activity
 * row. Same shape and styling as ContactHistoryFeed but reads from
 * /api/range-activities/:id/history. Append-only, newest-first.
 */
import { useCallback, useEffect, useState } from "react";
import { History, Loader2, ArrowLeft } from "lucide-react";
import type { ActivityFieldHistoryEntry } from "@/lib/types";

interface Props {
  activityId: string;
  /** Bumps when the parent saves an edit, so the feed reloads. */
  refreshTick?: number;
}

const FIELD_LABEL_HE: Record<string, string> = {
  activity_category: "קטגוריה",
  activity_description: "תיאור",
  missile_or_system_type: "מערכת / טיל",
  start_year: "שנת התחלה",
  end_year: "שנת סיום",
  status: "סטטוס",
  source_id: "מקור",
  confidence_level: "רמת מהימנות",
};

function fmt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function ActivityHistoryFeed({ activityId, refreshTick }: Props) {
  const [rows, setRows] = useState<ActivityFieldHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/range-activities/${encodeURIComponent(activityId)}/history`, { cache: "no-store" });
      const j = await res.json();
      setRows(j.history ?? []);
    } finally { setLoading(false); }
  }, [activityId]);

  useEffect(() => { reload(); }, [reload, refreshTick]);

  return (
    <section className="mt-3 border border-gray-200 rounded-md bg-white">
      <header className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-gray-500" />
        <h4 className="text-xs font-semibold text-gray-800">היסטוריית שינויים</h4>
        <span className="text-[10px] text-gray-400">({rows.length})</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
      </header>
      {!loading && rows.length === 0 ? (
        <p className="text-[11px] text-gray-500 px-3 py-3 text-center">
          אין שינויים מתועדים.
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-gray-800">{FIELD_LABEL_HE[r.field_name] ?? r.field_name}</span>
                  <span className="text-[10px] text-gray-400" dir="ltr">{fmt(r.changed_at)}</span>
                  {r.changed_by && <span className="text-[10px] text-gray-500">· על־ידי <span dir="auto">{r.changed_by}</span></span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]" dir="auto">
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                    {r.old_value === null || r.old_value === undefined || r.old_value === "" ? <em className="text-gray-400">ריק</em> : r.old_value}
                  </span>
                  <ArrowLeft className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded font-medium">
                    {r.new_value === null || r.new_value === undefined || r.new_value === "" ? <em className="text-gray-400">ריק</em> : r.new_value}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
