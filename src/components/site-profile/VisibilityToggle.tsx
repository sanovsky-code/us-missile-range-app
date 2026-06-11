"use client";

/**
 * Single-site visibility toggle — sits in the SiteHeader alongside the
 * favorite button.
 *
 * Hidden sites disappear from /map, the search autocomplete, /favorites,
 * and the Management task feed, but a direct URL to /site/:id still works
 * so a bookmarked link is never broken.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface Props {
  siteId: string;
  initialIsHidden: boolean;
}

export default function VisibilityToggle({ siteId, initialIsHidden }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialIsHidden);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    const next = !hidden;
    setHidden(next); // optimistic
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setHidden(!next); // revert
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={hidden}
        title={hidden ? "האתר מוסתר מהמפה והחיפוש" : "האתר מוצג במפה והחיפוש"}
        className={
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border " +
          (hidden
            ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
        }
      >
        {pending
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : hidden
          ? <EyeOff className="w-4 h-4" />
          : <Eye className="w-4 h-4" />}
        {hidden ? "מוסתר" : "הסתר מהמפה"}
      </button>
      {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
    </div>
  );
}
