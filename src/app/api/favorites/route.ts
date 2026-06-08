import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/favorites → joined list of every site marked as favorite. */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ favorites: store.listFavoriteSites() });
}
