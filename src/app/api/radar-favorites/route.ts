import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/radar-favorites → list every favorited radar joined to its
 * radar + site columns. Used by /favorites page to render the Radars
 * section. */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ radars: store.listFavoriteRadars() });
}
