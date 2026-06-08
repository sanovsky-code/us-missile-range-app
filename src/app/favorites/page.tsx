/**
 * "מועדפים" tab — list of every Site the operator marked as favorite.
 *
 * Server-renders the initial list via DataStore.listFavoriteSites (one
 * joined query) and hands it to a client view that handles search,
 * filter, and inline remove.
 */
import { getDataStore } from "@/lib/data-store";
import FavoritesView from "@/components/favorites/FavoritesView";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const store = getDataStore();
  await store.ensureLoaded();
  const favorites = store.listFavoriteSites();

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">אתרים מועדפים</h1>
          <p className="text-sm text-gray-600 mt-1">
            רשימת האתרים שסימנת כמועדפים. סימון מועדף הוא העדפת משתמש בלבד — הוא לא משכפל את האתר ולא מושפע מייבוא אקסל.
          </p>
        </header>
        <FavoritesView initial={favorites} />
      </div>
    </main>
  );
}
