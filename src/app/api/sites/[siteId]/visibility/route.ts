import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/**
 * PATCH /api/sites/:siteId/visibility
 * Body: { is_hidden: boolean }
 *
 * Toggles the per-site hide flag. Idempotent. Doesn't touch the country-
 * level list; if the site's country is on hidden_countries the site will
 * stay hidden even when its own is_hidden is set back to false.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = (await request.json()) as { is_hidden?: boolean };
    if (typeof body.is_hidden !== "boolean") {
      return NextResponse.json({ error: "is_hidden boolean required" }, { status: 400 });
    }
    const store = getDataStore();
    await store.ensureLoaded();
    const site = store.setSiteHidden(siteId, body.is_hidden);
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    return NextResponse.json({ site });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update visibility";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
