"use client";

/**
 * /countries — Salesforce-style list of every country in the system.
 *
 * Each row shows total / hidden site counts and links to the country
 * portal page (/country/:name) — the "Account" record. Inline toggle
 * to hide / show the whole country also still works for fast admin.
 *
 * Adding a country to the hide list is a rule: sites later imported
 * into that country are automatically hidden without further action.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Eye, EyeOff, Loader2, Search, RefreshCw, ExternalLink } from "lucide-react";

interface CountryRow {
  country: string;
  total: number;
  hidden_sites: number;
  visible_sites: number;
  country_hidden: boolean;
}

export default function AdminCountriesPage() {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/countries", { cache: "no-store" });
      const data = await res.json();
      setRows(data.countries ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.country.toLowerCase().includes(q));
  }, [rows, query]);

  const toggleCountry = async (row: CountryRow) => {
    setBusyFor(row.country); setError(null);
    try {
      if (row.country_hidden) {
        const res = await fetch(`/api/admin/hidden-countries/${encodeURIComponent(row.country)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch("/api/admin/hidden-countries", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: row.country }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      // Optimistic local flip — saves a round-trip and the data refreshes
      // on next reload anyway.
      setRows((prev) => prev.map((r) =>
        r.country === row.country ? { ...r, country_hidden: !r.country_hidden } : r
      ));
    } catch (e) { setError((e as Error).message); }
    finally { setBusyFor(null); }
  };

  const hiddenCountriesCount = rows.filter((r) => r.country_hidden).length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-6">
        <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">ניהול מדינות</h1>
            <span className="text-sm text-gray-500">({rows.length} מדינות, {hiddenCountriesCount} מוסתרות)</span>
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700"
          >
            <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
            רענן
          </button>
        </header>

        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          הסתרה של מדינה משאירה את הנתונים במסד אך מסירה אותם מהמפה, מהחיפוש, מהמועדפים וממסך ניהול המשימות.
          סייטים חדשים שייובאו בעתיד למדינה מוסתרת יוסתרו אוטומטית.
          כניסה ישירה ב־URL לאתר ספציפי תמיד עובדת.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-gray-200">
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש מדינה..."
                className="w-full pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-md"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-800">{error}</div>
          )}

          {loading && rows.length === 0 ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              {rows.length === 0 ? "אין מדינות במסד הנתונים." : "לא נמצאו מדינות לחיפוש."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">מדינה</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">סה&quot;כ אתרים</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">מוסתרים בודדית</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">סטטוס מדינה</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.country} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/country/${encodeURIComponent(r.country)}`}
                        className="font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                        dir="auto"
                      >
                        {r.country}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.total}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.hidden_sites > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          <EyeOff className="w-3 h-3" /> {r.hidden_sites}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.country_hidden ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                          <EyeOff className="w-3 h-3" /> כל המדינה מוסתרת
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-800">
                          <Eye className="w-3 h-3" /> גלויה
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCountry(r)}
                        disabled={busyFor === r.country}
                        className={
                          "inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border " +
                          (r.country_hidden
                            ? "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                            : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100")
                        }
                      >
                        {busyFor === r.country
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : r.country_hidden
                          ? <Eye className="w-3.5 h-3.5" />
                          : <EyeOff className="w-3.5 h-3.5" />}
                        {r.country_hidden ? "החזר למפה" : "הסתר מהמפה"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
