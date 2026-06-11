"use client";

/**
 * /opportunities — Salesforce-style sales pipeline list.
 *
 * Columns: Name | Country | Site | Stage | Probability | Amount | Close Date | Owner.
 * Top-right: "+ הזדמנות חדשה" → OpportunityFormModal.
 * Visibility-aware: rows whose Site/Country is hidden never appear.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Briefcase, RefreshCw } from "lucide-react";
import type { Opportunity, OpportunityListItem, OpportunityStage } from "@/lib/types";
import { OPPORTUNITY_STAGES, STAGE_HEBREW } from "@/lib/types";
import OpportunityFormModal from "@/components/opportunities/OpportunityFormModal";

function stageBadgeClass(stage: OpportunityStage): string {
  switch (stage) {
    case "Awarded": return "bg-green-100 text-green-800 border-green-200";
    case "Lost": return "bg-red-100 text-red-800 border-red-200";
    case "Negotiation": return "bg-purple-100 text-purple-800 border-purple-200";
    case "Proposal": return "bg-blue-100 text-blue-800 border-blue-200";
    case "Demo": return "bg-amber-100 text-amber-800 border-amber-200";
    case "RFI Submitted": return "bg-cyan-100 text-cyan-800 border-cyan-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatAmount(n?: number): string {
  if (n === undefined || n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export default function OpportunitiesListPage() {
  const [items, setItems] = useState<OpportunityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "">("");
  const [openCreate, setOpenCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/opportunities", { cache: "no-store" });
      const data = await res.json();
      setItems(data.opportunities ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      if (stageFilter && o.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.site_name ?? "").toLowerCase().includes(q) ||
        (o.country ?? "").toLowerCase().includes(q) ||
        (o.owner ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, stageFilter]);

  // Pipeline summary: total $ by non-closed stages.
  const pipelineTotal = useMemo(
    () => filtered
      .filter((o) => o.stage !== "Lost")
      .reduce((acc, o) => acc + (o.amount ?? 0), 0),
    [filtered],
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-6">
        <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">הזדמנויות</h1>
            <span className="text-sm text-gray-500">({items.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700"
              title="רענן"
            >
              <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
            </button>
            <button
              onClick={() => setOpenCreate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              <Plus className="w-4 h-4" />
              הזדמנות חדשה
            </button>
          </div>
        </header>

        {/* Pipeline summary */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold">סך הזדמנויות</div>
            <div className="text-xl font-bold text-gray-900">{filtered.length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold">סך פייפליין (USD)</div>
            <div className="text-xl font-bold text-blue-700" dir="ltr">{formatAmount(pipelineTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold">זכייה</div>
            <div className="text-xl font-bold text-green-700">
              {filtered.filter((o) => o.stage === "Awarded").length}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold">אבדה</div>
            <div className="text-xl font-bold text-red-700">
              {filtered.filter((o) => o.stage === "Lost").length}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם, אתר, מדינה או owner..."
                className="w-full pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-md"
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as OpportunityStage | "")}
              className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white"
            >
              <option value="">כל ה-Stages</option>
              {OPPORTUNITY_STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_HEBREW[s]} ({s})</option>
              ))}
            </select>
            <span className="text-xs text-gray-500 mr-auto">
              מציג {filtered.length} מתוך {items.length}
            </span>
          </div>

          {/* Table */}
          {loading && items.length === 0 ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              {items.length === 0
                ? <p>אין הזדמנויות עדיין. לחץ &quot;הזדמנות חדשה&quot; כדי להוסיף את הראשונה.</p>
                : <p>לא נמצאו תוצאות לסינון הנוכחי.</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">שם ההזדמנות</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">מדינה</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">אתר</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">Stage</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">%</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">Close Date</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/opportunity/${o.id}`}
                        className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                        dir="auto"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="auto">
                      <Link href={`/country/${encodeURIComponent(o.country)}`} className="hover:text-blue-700 hover:underline">
                        {o.country}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <Link href={`/site/${o.site_id}`} className="hover:text-blue-700 hover:underline" dir="auto">
                        {o.site_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border " +
                        stageBadgeClass(o.stage)
                      }>
                        {STAGE_HEBREW[o.stage]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {o.probability ?? 0}%
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium" dir="ltr">
                      {formatAmount(o.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {o.close_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="auto">{o.owner ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openCreate && (
        <OpportunityFormModal
          mode="create"
          onClose={() => setOpenCreate(false)}
          onSaved={async (_saved: Opportunity) => {
            setOpenCreate(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}
