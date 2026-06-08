"use client";

/**
 * Reusable favorite toggle for a single site.
 *
 * Used by the Site detail page header and the map popup. Optimistic UI: the
 * star fills immediately on click and reverts only if the API call fails.
 *
 * variant="full" → labelled button suitable for the Site detail header.
 * variant="icon" → compact star-only button suitable for popups and lists.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star, Loader2 } from "lucide-react";

interface Props {
  siteId: string;
  initialIsFavorite: boolean;
  variant?: "full" | "icon";
  /** Notify the parent after a successful toggle (e.g. so the /favorites
   * page can drop the row from its list without a full reload). */
  onChanged?: (isFavorite: boolean) => void;
}

export default function FavoriteButton({
  siteId,
  initialIsFavorite,
  variant = "full",
  onChanged,
}: Props) {
  const router = useRouter();
  const [isFav, setIsFav] = useState(initialIsFavorite);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    const next = !isFav;
    setIsFav(next); // optimistic
    try {
      const res = await fetch(`/api/favorites/${encodeURIComponent(siteId)}`, {
        method: next ? "POST" : "DELETE",
        headers: next ? { "Content-Type": "application/json" } : undefined,
        body: next ? JSON.stringify({}) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onChanged?.(next);
      // Refresh server components (e.g. the SiteHeader on the Site page)
      // so they reflect the new state on hard navigation.
      startTransition(() => router.refresh());
    } catch (e) {
      setIsFav(!next); // revert
      setError((e as Error).message);
    }
  };

  const ariaLabel = isFav ? "הסר ממועדפים" : "הוסף למועדפים";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-pressed={isFav}
        className={
          "p-1.5 rounded-md transition-colors " +
          (isFav
            ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50"
            : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-50")
        }
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Star className="w-4 h-4" fill={isFav ? "currentColor" : "none"} />
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isFav}
        className={
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
          (isFav
            ? "bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200"
            : "bg-white text-gray-700 border border-gray-300 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300")
        }
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Star className="w-4 h-4" fill={isFav ? "currentColor" : "none"} />
        )}
        {isFav ? "הסר ממועדפים" : "הוסף למועדפים"}
      </button>
      {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
    </div>
  );
}
