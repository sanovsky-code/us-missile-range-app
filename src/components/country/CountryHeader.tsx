"use client";

/**
 * Top header for the /country/[name] portal page.
 *
 * Renders the country name + key counters + the country-level visibility
 * toggle. Kept as a client component so the toggle can flip optimistically
 * and re-fetch via router.refresh().
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Globe, Eye, EyeOff, Loader2, ChevronRight, MapPin, Building2, Radio, Activity, ListChecks } from "lucide-react";
import type { CountryOverviewMeta } from "@/lib/types";

interface Props {
  meta: CountryOverviewMeta;
}

export default function CountryHeader({ meta }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(meta.country_hidden);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    const next = !hidden;
    setHidden(next); // optimistic
    try {
      if (next) {
        const res = await fetch("/api/admin/hidden-countries", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: meta.name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch(`/api/admin/hidden-countries/${encodeURIComponent(meta.name)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setHidden(!next); // revert
      setError((e as Error).message);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <nav className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <Link href="/countries" className="hover:text-blue-700 inline-flex items-center gap-1">
            <Globe className="w-3 h-3" />
            מדינות
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-900" dir="auto">{meta.name}</span>
        </nav>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-gray-500">Country / Account</div>
            <h1 className="text-2xl font-bold text-gray-900" dir="auto">{meta.name}</h1>
            {hidden && (
              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <EyeOff className="w-3 h-3" />
                כל המדינה מוסתרת — סייטים אינם מופיעים במפה, בחיפוש, במועדפים או במסך ניהול המשימות.
              </p>
            )}
          </div>
          <button
            onClick={toggle}
            disabled={pending}
            className={
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border " +
              (hidden
                ? "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100")
            }
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" />
              : hidden ? <Eye className="w-4 h-4" />
              : <EyeOff className="w-4 h-4" />}
            {hidden ? "החזר את המדינה למפה" : "הסתר את כל המדינה"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {/* Quick stats — Salesforce-style highlight row */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Stat icon={<Building2 className="w-3 h-3" />} label="סך אתרים" value={meta.total_sites} />
          <Stat icon={<Eye className="w-3 h-3" />} label="גלויים" value={meta.visible_sites} variant="ok" />
          <Stat icon={<EyeOff className="w-3 h-3" />} label="מוסתרים בודדית" value={meta.hidden_sites} variant={meta.hidden_sites > 0 ? "warn" : undefined} />
          <Stat icon={<Radio className="w-3 h-3" />} label="ראדרים" value={meta.total_radars} />
          <Stat icon={<ListChecks className="w-3 h-3" />} label="משימות פתוחות" value={meta.open_tasks} variant={meta.open_tasks > 0 ? "info" : undefined} />
        </div>
      </div>
    </div>
  );
}


function Stat({
  icon, label, value, variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: "ok" | "warn" | "info";
}) {
  const tone = variant === "ok" ? "text-green-700"
    : variant === "warn" ? "text-amber-700"
    : variant === "info" ? "text-blue-700"
    : "text-gray-900";
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 font-semibold flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={"text-xl font-bold " + tone}>{value.toLocaleString("he-IL")}</div>
    </div>
  );
}
