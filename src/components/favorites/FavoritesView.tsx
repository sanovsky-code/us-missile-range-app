"use client";

/**
 * Client-side renderer for the /favorites page.
 *
 * Receives the initial favorites list from the server component (one
 * SQL query — see DataStore.listFavoriteSites) and lets the operator
 * filter it by name/id/country/state and remove rows in place.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Star, ExternalLink, Trash2, Radio, ListChecks, MapPin } from "lucide-react";
import type { FavoriteSiteListItem } from "@/lib/types";

interface Props {
  initial: FavoriteSiteListItem[];
}

export default function FavoritesView({ initial }: Props) {
  const [favorites, setFavorites] = useState<FavoriteSiteListItem[]>(initial);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(
    () => Array.from(new Set(favorites.map((f) => f.country).filter(Boolean))).sort(),
    [favorites],
  );
  const states = useMemo(
    () => Array.from(new Set(favorites.map((f) => f.state).filter(Boolean))).sort(),
    [favorites],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return favorites.filter((f) => {
      if (country && f.country !== country) return false;
      if (state && f.state !== state) return false;
      if (!q) return true;
      return (
        f.site_name.toLowerCase().includes(q) ||
        f.site_id.toLowerCase().includes(q)
      );
    });
  }, [favorites, search, country, state]);

  const remove = async (siteId: string) => {
    if (!confirm("האם להסיר את האתר מהמועדפים?")) return;
    setBusyFor(siteId); setError(null);
    try {
      const res = await fetch(`/api/favorites/${encodeURIComponent(siteId)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setFavorites((prev) => prev.filter((f) => f.site_id !== siteId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyFor(null);
    }
  };

  if (favorites.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <Star className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">אין אתרים מועדפים עדיין.</h2>
        <p className="text-sm text-gray-500">
          ניתן לסמן אתר כמועדף מתוך כרטיס האתר או מסך פרטי האתר.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם אתר או Site ID..."
            className="w-full pr-8 pl-3 py-2 border border-gray-200 rounded-md text-sm"
            dir="rtl"
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="border border-gray-200 rounded-md px-2 py-1.5 bg-white text-sm"
        >
          <option value="">כל המדינות</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="border border-gray-200 rounded-md px-2 py-1.5 bg-white text-sm"
        >
          <option value="">כל המחוזות</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-gray-500">
          מציג {filtered.length} מתוך {favorites.length}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((f) => (
          <article
            key={f.site_id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-colors flex flex-col"
          >
            <header className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <Link
                  href={`/site/${f.site_id}`}
                  className="text-base font-semibold text-gray-900 hover:text-blue-700 block text-left truncate"
                  dir="ltr"
                  title={f.site_name}
                >
                  {f.site_name}
                </Link>
                <div className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{f.site_id}</div>
              </div>
              <Star className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" />
            </header>

            <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span dir="ltr">{f.country || "—"}{f.state ? ` / ${f.state}` : ""}</span>
              </span>
              {f.managing_organization && (
                <span className="truncate" title={f.managing_organization} dir="ltr">
                  {f.managing_organization}
                </span>
              )}
            </div>

            {f.description && (
              <p className="text-xs text-gray-600 line-clamp-3 mb-3 text-left" dir="ltr" title={f.description}>
                {f.description}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3" /> {f.radar_count} מכ&quot;מים
              </span>
              <span className="flex items-center gap-1">
                <ListChecks className="w-3 h-3" /> {f.open_task_count} משימות פתוחות
              </span>
              {f.last_verified_date && (
                <span>אומת: <span dir="ltr">{f.last_verified_date}</span></span>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100">
              <Link
                href={`/site/${f.site_id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                פתח אתר
              </Link>
              <button
                type="button"
                onClick={() => remove(f.site_id)}
                disabled={busyFor === f.site_id}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                הסר ממועדפים
              </button>
            </footer>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          אין אתרים מועדפים שתואמים את החיפוש.
        </div>
      )}
    </div>
  );
}
