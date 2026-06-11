"use client";

/**
 * Salesforce-style Field History card.
 *
 * Renders rows from /api/opportunities/:id/history, newest-first. Each row
 * shows: Date · Field · Old → New · changed-by. The "__created__" sentinel
 * row is rendered as a single "ההזדמנות נוצרה" lifecycle anchor instead of
 * the Field/Old/New triple.
 *
 * Append-only on the server — no delete or edit affordance here.
 */
import { useCallback, useEffect, useState } from "react";
import { History, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import type { OpportunityFieldHistoryEntry, OpportunityStage } from "@/lib/types";
import { OPPORTUNITY_FIELD_LABELS_HE, STAGE_HEBREW } from "@/lib/types";

interface Props { opportunityId: number; }

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/** Pretty-print a single field value for display. */
function renderValue(field: string, raw?: string): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (field === "stage") {
    const heb = STAGE_HEBREW[raw as OpportunityStage];
    return heb ? `${heb} (${raw})` : raw;
  }
  if (field === "amount") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD", maximumFractionDigits: 0,
      }).format(n);
    }
    return raw;
  }
  if (field === "probability") return `${raw}%`;
  if (field === "budget_confirmed" || field === "discovery_completed" || field === "roi_analysis_completed") {
    return raw === "1" || raw === "true" ? "כן" : "לא";
  }
  return raw;
}

function fieldLabel(field: string): string {
  if (field in OPPORTUNITY_FIELD_LABELS_HE) {
    return OPPORTUNITY_FIELD_LABELS_HE[field as keyof typeof OPPORTUNITY_FIELD_LABELS_HE];
  }
  return field;
}

export default function OpportunityHistoryCard({ opportunityId }: Props) {
  const [rows, setRows] = useState<OpportunityFieldHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/history`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.history ?? []);
    } finally { setLoading(false); }
  }, [opportunityId]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <History className="w-4 h-4 text-gray-500" />
        <h3 className="text-base font-semibold text-gray-900">היסטוריה</h3>
        <span className="text-xs text-gray-400">({rows.length})</span>
      </header>

      <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        )}
        {!loading && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">
            <History className="w-7 h-7 mx-auto text-gray-300 mb-2" />
            אין שינויים מתועדים.
          </div>
        )}
        {!loading && rows.map((r) => {
          if (r.field_name === "__created__") {
            return (
              <article key={r.id} className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/30">
                <header className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">ההזדמנות נוצרה</span>
                  </div>
                  <span className="text-[10px] text-gray-400">{fmtDate(r.changed_at)}</span>
                </header>
                {r.new_value && (
                  <p className="text-xs text-gray-700 mt-1" dir="auto">{r.new_value}</p>
                )}
                {r.changed_by && (
                  <p className="text-[10px] text-gray-400 mt-1">על־ידי {r.changed_by}</p>
                )}
              </article>
            );
          }

          return (
            <article key={r.id} className="border border-gray-100 rounded-lg p-3">
              <header className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-800">{fieldLabel(r.field_name)}</span>
                <span className="text-[10px] text-gray-400">{fmtDate(r.changed_at)}</span>
              </header>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs" dir="auto">
                  {renderValue(r.field_name, r.old_value)}
                </span>
                <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-medium" dir="auto">
                  {renderValue(r.field_name, r.new_value)}
                </span>
              </div>
              {r.changed_by && (
                <p className="text-[10px] text-gray-400 mt-1">על־ידי {r.changed_by}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
