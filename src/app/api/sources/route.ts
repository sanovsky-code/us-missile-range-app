import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/sources — lightweight list used by the source-id lookup
 * (source-id, title, type, publisher). Sorted by source_id ASC. */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ sources: store.listSources() });
}
