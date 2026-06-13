/**
 * /country/[name] — Salesforce-style "Account" page for a country.
 *
 * Server-rendered (no client fetches) — the page calls the data-store
 * directly. Layout, top-to-bottom:
 *
 *   1. Sticky header — country name + key counters + visibility toggle
 *   2. Data Quality breakdown (confidence + record_status)
 *   3. Related: Sites (table)
 *   4. Related: Radars (aggregated)
 *   5. Related: Activities (aggregated + 10 most recent)
 *   6. Related: Contacts (mix of site_contacts + imported + crm)
 *   7. Related: Sources (distinct citations across all entities)
 */
import Link from "next/link";
import { use as useReact } from "react";
import { getDataStore } from "@/lib/data-store";
import CountryHeader from "@/components/country/CountryHeader";
import { Building2, Radio, Activity, Users, BookOpen, Gauge, ExternalLink, EyeOff, Cpu } from "lucide-react";
import type {
  CountrySiteRow, CountryRadarBreakdown, CountrySystemBreakdown, CountryActivityBreakdown,
  CountryContactRow, CountrySourceRow, CountryDataQuality,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default function CountryPortalPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = useReact(params);
  const country = decodeURIComponent(name);
  const store = getDataStore();
  // Data-store is synchronous (better-sqlite3) so we can just call it.
  const overview = store.getCountryOverview(country);

  if (!overview) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6" dir="rtl">
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-700">לא נמצאה מדינה בשם &quot;{country}&quot;.</p>
          <Link href="/countries" className="inline-block mt-3 text-blue-700 hover:underline">חזרה למדינות</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 pb-12" dir="rtl">
      <CountryHeader meta={overview.meta} />

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <DataQualityCard dq={overview.data_quality} totalSites={overview.meta.total_sites} />
        <SitesCard sites={overview.sites} />
        <RadarsCard breakdown={overview.radar_breakdown} totalRadars={overview.meta.total_radars} />
        <SystemsCard breakdown={overview.system_breakdown} totalSystems={overview.meta.total_systems} />
        <ActivitiesCard breakdown={overview.activity_breakdown} totalActivities={overview.meta.total_operational_activities} />
        <ContactsCard contacts={overview.contacts} />
        <SourcesCard sources={overview.sources} />
      </div>
    </div>
  );
}


/* ============================== Card primitives ============================== */

function Card({
  icon, title, count, children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-indigo-500">{icon}</span>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        {typeof count === "number" && (
          <span className="text-sm text-gray-500">({count.toLocaleString("he-IL")})</span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyValue({ label = "אין נתונים." }: { label?: string }) {
  return <p className="text-sm text-gray-500 italic">{label}</p>;
}


/* ============================== Data Quality ============================== */

const CONFIDENCE_HEBREW: Record<string, string> = { High: "גבוהה", Medium: "בינונית", Low: "נמוכה", Unknown: "לא ידוע" };
const CONFIDENCE_CLS: Record<string, string> = {
  High: "bg-green-100 text-green-800 border-green-200",
  Medium: "bg-blue-100 text-blue-800 border-blue-200",
  Low: "bg-amber-100 text-amber-800 border-amber-200",
  Unknown: "bg-gray-100 text-gray-700 border-gray-200",
};

function DataQualityCard({ dq, totalSites }: { dq: CountryDataQuality; totalSites: number }) {
  return (
    <Card icon={<Gauge className="w-5 h-5" />} title="איכות נתונים">
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-2">רמת ביטחון</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {dq.by_confidence.map((c) => (
              <span key={c.level} className={"inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border " + (CONFIDENCE_CLS[c.level] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                {CONFIDENCE_HEBREW[c.level] ?? c.level}: <strong>{c.count}</strong>
                <span className="text-gray-500 mr-1">({totalSites > 0 ? Math.round((c.count / totalSites) * 100) : 0}%)</span>
              </span>
            ))}
            {dq.by_confidence.length === 0 && <EmptyValue />}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-2">סטטוס רשומה</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {dq.by_record_status.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-gray-50 text-gray-800 border-gray-200">
                {s.status}: <strong>{s.count}</strong>
              </span>
            ))}
            {dq.by_record_status.length === 0 && <EmptyValue />}
          </div>
        </div>
      </div>
    </Card>
  );
}


/* ============================== Sites ============================== */

function SitesCard({ sites }: { sites: CountrySiteRow[] }) {
  return (
    <Card icon={<Building2 className="w-5 h-5" />} title="אתרים" count={sites.length}>
      {sites.length === 0 ? <EmptyValue /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-600 border-b border-gray-200">
                <th className="px-2 py-2">שם האתר</th>
                <th className="px-2 py-2">סוג</th>
                <th className="px-2 py-2">גודל</th>
                <th className="px-2 py-2">ביטחון</th>
                <th className="px-2 py-2">סטטוס</th>
                <th className="px-2 py-2">מדינת משנה</th>
                <th className="px-2 py-2">ראדרים</th>
                <th className="px-2 py-2">מערכות</th>
                <th className="px-2 py-2">פעילויות</th>
                <th className="px-2 py-2">משימות פתוחות</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.site_id} className={"border-b border-gray-100 " + (s.is_hidden ? "bg-amber-50/40" : "hover:bg-gray-50/50")}>
                  <td className="px-2 py-2">
                    <Link href={`/site/${s.site_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="auto">
                      {s.site_name}
                      {s.is_hidden && (
                        <span className="inline-flex items-center text-amber-700" title="האתר מוסתר בודדית">
                          <EyeOff className="w-3 h-3" />
                        </span>
                      )}
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                    </Link>
                    <div className="text-xs text-gray-500 font-mono" dir="ltr">{s.site_id}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-700">{s.site_type ?? "—"}</td>
                  <td className="px-2 py-2 text-gray-700">{s.size_category ?? "—"}</td>
                  <td className="px-2 py-2">
                    {s.confidence_level ? (
                      <span className={"text-xs px-1.5 py-0.5 rounded border " + (CONFIDENCE_CLS[s.confidence_level] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                        {CONFIDENCE_HEBREW[s.confidence_level] ?? s.confidence_level}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-2 py-2 text-gray-700">{s.record_status ?? "—"}</td>
                  <td className="px-2 py-2 text-gray-700" dir="auto">{s.state || "—"}</td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">{s.radar_count}</td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">{s.system_count}</td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">{s.activity_count}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {s.open_task_count > 0 ? (
                      <span className="inline-block text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {s.open_task_count}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


/* ============================== Radars ============================== */

function RadarsCard({ breakdown, totalRadars }: { breakdown: CountryRadarBreakdown; totalRadars: number }) {
  return (
    <Card icon={<Radio className="w-5 h-5" />} title="ראדרים" count={totalRadars}>
      {totalRadars === 0 ? <EmptyValue /> : (
        <div className="grid md:grid-cols-3 gap-4">
          <Breakdown title="לפי סוג" rows={breakdown.by_type} />
          <Breakdown title="לפי תדר" rows={breakdown.by_band} />
          <Breakdown title="דגמים מובילים" rows={breakdown.top_models} />
        </div>
      )}
    </Card>
  );
}


/* ============================== Systems ============================== */

function SystemsCard({ breakdown, totalSystems }: { breakdown: CountrySystemBreakdown; totalSystems: number }) {
  return (
    <Card icon={<Cpu className="w-5 h-5" />} title="מערכות" count={totalSystems}>
      {totalSystems === 0 ? <EmptyValue /> : (
        <div className="grid md:grid-cols-3 gap-4">
          <Breakdown title="לפי קטגוריה" rows={breakdown.by_category} />
          <Breakdown title="לפי סטטוס תפעולי" rows={breakdown.by_status} />
          <Breakdown title="בעלים מובילים" rows={breakdown.top_owners} />
        </div>
      )}
    </Card>
  );
}


/* ============================== Activities ============================== */

function ActivitiesCard({ breakdown, totalActivities }: { breakdown: CountryActivityBreakdown; totalActivities: number }) {
  return (
    <Card icon={<Activity className="w-5 h-5" />} title="פעילויות תפעוליות" count={totalActivities}>
      {totalActivities === 0 ? <EmptyValue /> : (
        <div className="grid md:grid-cols-2 gap-4">
          <Breakdown title="לפי קטגוריה" rows={breakdown.by_category} />
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">10 פעילויות אחרונות</h4>
            {breakdown.recent.length === 0 ? <EmptyValue /> : (
              <ul className="space-y-1.5 text-xs">
                {breakdown.recent.map((r) => (
                  <li key={r.activity_id} className="border border-gray-100 rounded p-2 hover:bg-gray-50/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-gray-500" dir="ltr">{r.activity_id}</span>
                      {r.activity_category && (
                        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{r.activity_category}</span>
                      )}
                      {r.start_year && <span className="text-gray-500">{r.start_year}{r.end_year && r.end_year !== r.start_year ? `–${r.end_year}` : ""}</span>}
                    </div>
                    {r.activity_description && (
                      <p className="text-gray-700 mt-1 line-clamp-2" dir="auto" title={r.activity_description}>{r.activity_description}</p>
                    )}
                    <Link href={`/site/${r.site_id}`} className="text-[10px] text-blue-600 hover:underline" dir="auto">
                      {r.site_name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}


/* ============================== Contacts ============================== */

function ContactsCard({ contacts }: { contacts: CountryContactRow[] }) {
  const sourceLabel: Record<CountryContactRow["source"], string> = {
    site_contact: "אתר",
    imported_contact: "מיובא",
    crm_contact: "CRM",
  };
  const sourceCls: Record<CountryContactRow["source"], string> = {
    site_contact: "bg-blue-50 text-blue-700",
    imported_contact: "bg-gray-100 text-gray-700",
    crm_contact: "bg-purple-50 text-purple-700",
  };
  return (
    <Card icon={<Users className="w-5 h-5" />} title="אנשי קשר" count={contacts.length}>
      {contacts.length === 0 ? <EmptyValue /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-600 border-b border-gray-200">
                <th className="px-2 py-2">מקור</th>
                <th className="px-2 py-2">שם</th>
                <th className="px-2 py-2">ארגון</th>
                <th className="px-2 py-2">סוג</th>
                <th className="px-2 py-2">אימייל</th>
                <th className="px-2 py-2">טלפון</th>
                <th className="px-2 py-2">אתר</th>
              </tr>
            </thead>
            <tbody>
              {contacts.slice(0, 50).map((c) => {
                const detailHref = c.source === "crm_contact" ? `/contacts/${c.ref_id}` : `/site/${c.site_id}`;
                return (
                  <tr key={`${c.source}-${c.ref_id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-2 py-2">
                      <span className={"text-[10px] px-1.5 py-0.5 rounded font-semibold " + sourceCls[c.source]}>
                        {sourceLabel[c.source]}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <Link href={detailHref} className="text-blue-700 hover:underline" dir="auto">{c.full_name}</Link>
                    </td>
                    <td className="px-2 py-2 text-gray-700" dir="auto">{c.organization ?? "—"}</td>
                    <td className="px-2 py-2 text-gray-700">{c.contact_type ?? "—"}</td>
                    <td className="px-2 py-2 text-gray-700" dir="ltr">
                      {c.email ? <a href={`mailto:${c.email}`} className="hover:underline text-blue-700">{c.email}</a> : "—"}
                    </td>
                    <td className="px-2 py-2 text-gray-700" dir="ltr">{c.phone ?? "—"}</td>
                    <td className="px-2 py-2">
                      <Link href={`/site/${c.site_id}`} className="text-blue-700 hover:underline text-xs" dir="auto">{c.site_name}</Link>
                    </td>
                  </tr>
                );
              })}
              {contacts.length > 50 && (
                <tr><td colSpan={7} className="px-2 py-2 text-xs text-gray-500 text-center">…ועוד {contacts.length - 50} אנשי קשר.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


/* ============================== Sources ============================== */

function SourcesCard({ sources }: { sources: CountrySourceRow[] }) {
  return (
    <Card icon={<BookOpen className="w-5 h-5" />} title="מקורות" count={sources.length}>
      {sources.length === 0 ? <EmptyValue /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-600 border-b border-gray-200">
                <th className="px-2 py-2">Source ID</th>
                <th className="px-2 py-2">כותרת</th>
                <th className="px-2 py-2">סוג</th>
                <th className="px-2 py-2">מפרסם</th>
                <th className="px-2 py-2">ציטוטים</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-2 py-2">
                    <Link href={`/source/${s.source_id}`} className="text-blue-700 hover:underline font-mono text-xs" dir="ltr">
                      {s.source_id}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-gray-900 max-w-md truncate" title={s.source_title} dir="auto">{s.source_title}</td>
                  <td className="px-2 py-2 text-gray-700">{s.source_type ?? "—"}</td>
                  <td className="px-2 py-2 text-gray-700 max-w-xs truncate" title={s.publisher ?? ""} dir="auto">{s.publisher ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    <span className="inline-block text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{s.citation_count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


/* ============================== Generic breakdown ============================== */

function Breakdown({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) {
  if (rows.length === 0) return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <EmptyValue />
    </div>
  );
  const max = rows[0]?.count ?? 0;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-800 truncate" dir="auto" title={r.key}>{r.key}</span>
              <span className="text-gray-500 tabular-nums">{r.count}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/70" style={{ width: max ? `${(r.count / max) * 100}%` : "0%" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
