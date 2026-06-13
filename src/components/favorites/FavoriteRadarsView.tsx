"use client";

/**
 * Radars section of the /favorites page. Lists every favorited Radar
 * joined to its parent Site, with quick filters by site and a remove
 * action. Mirrors FavoritesView for sites but with radar-specific
 * columns and the ⏱ lifecycle count chip.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Radio, Star, Search, ExternalLink, Trash2, Clock } from "lucide-react";
import type { FavoriteRadarListItem } from "@/lib/types";

interface Props {
  initial: FavoriteRadarListItem[];
}

export default function FavoriteRadarsView({ initial }: Props) {
  const [radars, setRadars] = useState<FavoriteRadarListItem[]>(initial);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(
    () => Array.from(new Set(radars.map((r) => r.country).filter(Boolean))).sort() as string[],
    [radars],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return radars.filter((r) => {
      if (country && r.country !== country) return false;
      if (!q) return true;
      return (
        r.radar_name.toLowerCase().includes(q) ||
        r.radar_id.toLowerCase().includes(q) ||
        (r.radar_model ?? "").toLowerCase().includes(q) ||
        (r.site_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [radars, search, country]);

  const remove = async (radarId: string) => {
    if (!confirm("להסיר ממועדפים?")) return;
    setBusyFor(radarId); setError(null);
    try {
      const res = await fetch(`/api/radar-favorites/${radarId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRadars((prev) => prev.filter((r) => r.radar_id !== radarId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyFor(null);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <header className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-blue-500" />
          <h2 className="text-base font-semibold text-gray-900">ראדרים מועדפים</h2>
          <span className="text-xs text-gray-500">({radars.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-2 top-2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, דגם, אתר..."
              className="pr-8 pl-3 py-1.5 text-sm border border-gray-200 rounded-md w-64"
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
          >
            <option value="">כל המדינות</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </header>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-sm text-red-800">{error}</div>
      )}

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          <Radio className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          {radars.length === 0
            ? "אין ראדרים מועדפים. סמן כוכב על ראדר ב-/site/[id] כדי להוסיף."
            : "אין תוצאות לסינון הנוכחי."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                <th className="text-right px-4 py-2.5 font-bold uppercase">שם המכ&quot;מ</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">דגם</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">סוג</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">סטטוס</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">אתר</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">מחזור חיים</th>
                <th className="text-right px-4 py-2.5 font-bold uppercase">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.radar_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                      <div>
                        <div className="font-medium text-gray-900" dir="auto">{r.radar_name}</div>
                        <div className="text-[11px] text-gray-400 font-mono" dir="ltr">{r.radar_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700" dir="ltr">{r.radar_model ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700" dir="ltr">{r.radar_type ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.operational_status ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/site/${r.site_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="auto">
                      {r.site_name ?? r.site_id}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    {r.country && <div className="text-[11px] text-gray-400">{r.country}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.lifecycle_count > 0 ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                        <Clock className="w-3 h-3" /> {r.lifecycle_count}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => remove(r.radar_id)}
                      disabled={busyFor === r.radar_id}
                      className="text-gray-400 hover:text-red-700 disabled:opacity-40"
                      title="הסר ממועדפים"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
