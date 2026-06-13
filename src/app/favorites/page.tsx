/**
 * "מועדפים" tab — operator's favorited Sites AND favorited Radars.
 *
 * Server-renders both initial lists via DataStore.listFavoriteSites() +
 * listFavoriteRadars() and hands them to two client views that handle
 * search, filter, and inline remove. Both pointer tables — favoriting
 * is per-installation, never duplicated on Excel re-import.
 */
import { getDataStore } from "@/lib/data-store";
import FavoritesView from "@/components/favorites/FavoritesView";
import FavoriteRadarsView from "@/components/favorites/FavoriteRadarsView";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const store = getDataStore();
  await store.ensureLoaded();
  const sites = store.listFavoriteSites();
  const radars = store.listFavoriteRadars();

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">מועדפים</h1>
          <p className="text-sm text-gray-600 mt-1">
            אתרים וראדרים שסימנת בכוכב. סימון מועדף הוא העדפת משתמש בלבד — הוא לא משכפל את הרשומה ולא מושפע מייבוא אקסל.
          </p>
        </header>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">אתרים</h2>
          <FavoritesView initial={sites} />
        </section>

        <FavoriteRadarsView initial={radars} />
      </div>
    </main>
  );
}
