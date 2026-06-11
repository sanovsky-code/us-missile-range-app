"use client";

/**
 * /opportunity/[id] — Salesforce-style Opportunity detail page.
 *
 * Layout mirrors /contacts/[id]:
 *   - Sticky top header: name + breadcrumb + Stage chip + key counters +
 *     Edit / Delete / Back.
 *   - Sidebar (sticky on desktop): OpportunityActivityTimeline.
 *   - Main column: details card + documents card + system metadata.
 *
 * A direct URL still loads even if the linked Site is hidden — mirrors the
 * bookmark-friendly behavior of /site/[id]. (The list view filters the row
 * out, the detail page just shows what we have.)
 */
import { useCallback, useEffect, useState, use as useReact } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Edit2, Trash2, ChevronRight, ArrowRight, Building2, Globe,
  DollarSign, Calendar, User, Target, ExternalLink,
} from "lucide-react";
import type { Opportunity, OpportunityStage } from "@/lib/types";
import { STAGE_HEBREW } from "@/lib/types";
import OpportunityActivityTimeline from "@/components/opportunities/OpportunityActivityTimeline";
import OpportunityDocumentsCard from "@/components/opportunities/OpportunityDocumentsCard";
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

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = useReact(params);
  const oppId = Number(id);
  const router = useRouter();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${oppId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOpp(json.opportunity as Opportunity);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [oppId]);

  useEffect(() => { reload(); }, [reload]);

  const onDelete = async () => {
    if (!opp) return;
    if (!confirm(`האם למחוק את ההזדמנות "${opp.name}"? פעולה זו תמחק גם את כל הפעילויות והמסמכים.`)) return;
    const res = await fetch(`/api/opportunities/${oppId}`, { method: "DELETE" });
    if (res.ok) router.push("/opportunities");
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Delete failed");
    }
  };

  if (loading && !opp) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6" dir="rtl">
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      </div>
    );
  }
  if (!opp) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6" dir="rtl">
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-700">{error ?? "ההזדמנות לא נמצאה."}</p>
          <Link href="/opportunities" className="inline-flex items-center gap-1 mt-3 text-blue-700 hover:underline">
            <ArrowRight className="w-4 h-4" /> חזרה להזדמנויות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 pb-12" dir="rtl">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Link href="/opportunities" className="hover:text-blue-700">הזדמנויות</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900" dir="auto">{opp.name}</span>
          </nav>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-gray-500">Opportunity</div>
              <h1 className="text-2xl font-bold text-gray-900" dir="auto">{opp.name}</h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={
                  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border " +
                  stageBadgeClass(opp.stage)
                }>
                  {STAGE_HEBREW[opp.stage]} ({opp.stage})
                </span>
                <span className="text-xs text-gray-500">
                  Probability: <span className="font-semibold text-gray-800">{opp.probability ?? 0}%</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700">
                <Edit2 className="w-4 h-4" /> עריכה
              </button>
              <button onClick={onDelete}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-red-200 hover:bg-red-50 rounded-md text-red-700">
                <Trash2 className="w-4 h-4" /> מחיקה
              </button>
            </div>
          </div>

          {/* Salesforce-style highlight row */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <SummaryItem icon={<Globe className="w-3 h-3" />} label="מדינה"
              value={opp.country}
              href={opp.country ? `/country/${encodeURIComponent(opp.country)}` : undefined} />
            <SummaryItem icon={<Building2 className="w-3 h-3" />} label="אתר"
              value={opp.site_name ?? opp.site_id}
              href={`/site/${opp.site_id}`} />
            <SummaryItem icon={<DollarSign className="w-3 h-3" />} label="Amount"
              value={formatAmount(opp.amount)} dir="ltr" />
            <SummaryItem icon={<Calendar className="w-3 h-3" />} label="Close Date"
              value={opp.close_date ?? "—"} dir="ltr" />
            <SummaryItem icon={<User className="w-3 h-3" />} label="Owner"
              value={opp.owner ?? "—"} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
        <aside className="lg:col-span-4 lg:order-first">
          <div className="lg:sticky lg:top-[180px]">
            <OpportunityActivityTimeline opportunityId={oppId} />
          </div>
        </aside>

        <div className="lg:col-span-8 space-y-4">
          <Card title="פרטי הזדמנות">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DLRow label="שם">{opp.name}</DLRow>
              <DLRow label="Stage">
                <span className={
                  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border " +
                  stageBadgeClass(opp.stage)
                }>
                  {STAGE_HEBREW[opp.stage]}
                </span>
              </DLRow>
              <DLRow label="Probability" dir="ltr">{opp.probability ?? 0}%</DLRow>
              <DLRow label="Amount" dir="ltr">{formatAmount(opp.amount)}</DLRow>
              <DLRow label="Close Date" dir="ltr">{opp.close_date ?? "—"}</DLRow>
              <DLRow label="Owner">{opp.owner ?? "—"}</DLRow>
              <DLRow label="מדינה">
                {opp.country ? (
                  <Link href={`/country/${encodeURIComponent(opp.country)}`} className="text-blue-700 hover:underline" dir="auto">
                    {opp.country}
                  </Link>
                ) : "—"}
              </DLRow>
              <DLRow label="אתר">
                <Link href={`/site/${opp.site_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="auto">
                  {opp.site_name ?? opp.site_id}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </DLRow>
              <DLRow label="Next Step">
                {opp.next_step ? <span className="inline-flex items-center gap-1"><Target className="w-3 h-3" />{opp.next_step}</span> : "—"}
              </DLRow>
              <DLRow label="Loss Reason">{opp.stage === "Lost" ? (opp.loss_reason ?? "—") : "—"}</DLRow>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <Flag label="תקציב מאושר" value={opp.budget_confirmed} />
              <Flag label="Discovery הושלם" value={opp.discovery_completed} />
              <Flag label="ניתוח ROI הושלם" value={opp.roi_analysis_completed} />
            </div>
          </Card>

          {opp.description && (
            <Card title="תיאור">
              <p className="text-sm text-gray-900 whitespace-pre-wrap" dir="auto">{opp.description}</p>
            </Card>
          )}

          <OpportunityDocumentsCard opportunityId={oppId} />

          <Card title="מידע מערכת">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DLRow label="נוצר על־ידי">{opp.created_by ?? "—"}</DLRow>
              <DLRow label="נוצר בתאריך">{fmtDateTime(opp.created_at)}</DLRow>
              <DLRow label="עודכן על־ידי">{opp.updated_by ?? "—"}</DLRow>
              <DLRow label="עודכן בתאריך">{fmtDateTime(opp.updated_at)}</DLRow>
            </div>
          </Card>
        </div>
      </div>

      {editing && (
        <OpportunityFormModal
          mode="edit"
          initial={opp}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await reload(); }}
        />
      )}
    </div>
  );
}


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DLRow({ label, dir, children }: { label: string; dir?: "ltr" | "rtl"; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5" dir={dir}>{children}</dd>
    </div>
  );
}

function SummaryItem({ icon, label, value, href, dir }: {
  icon?: React.ReactNode; label: string; value?: string; href?: string; dir?: "ltr" | "rtl";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 font-semibold flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-sm text-gray-900 truncate" dir={dir} title={value ?? undefined}>
        {value
          ? (href ? <Link href={href} className="text-blue-700 hover:underline">{value}</Link> : value)
          : <span className="text-gray-400">—</span>}
      </div>
    </div>
  );
}

function Flag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={
        "inline-flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold " +
        (value ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-400")
      }>
        {value ? "✓" : "○"}
      </span>
      <span className="text-gray-700">{label}</span>
    </div>
  );
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
