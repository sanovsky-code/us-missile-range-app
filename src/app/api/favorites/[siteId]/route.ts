import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/favorites/:siteId → { is_favorite: boolean } */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ site_id: siteId, is_favorite: store.isSiteFavorite(siteId) });
}

/**
 * POST /api/favorites/:siteId
 * Body (all optional): { created_by?: string; notes?: string }
 * Idempotent — adding an already-favorite site is a 200 no-op.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  let body: { created_by?: string; notes?: string } = {};
  try {
    if (request.headers.get("content-length")) {
      body = (await request.json()) as { created_by?: string; notes?: string };
    }
  } catch {
    // empty/invalid body → defaults
  }
  try {
    const store = getDataStore();
    await store.ensureLoaded();
    const inserted = store.addSiteFavorite(siteId, body);
    return NextResponse.json(
      { site_id: siteId, is_favorite: true, inserted },
      { status: inserted ? 201 : 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add favorite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/favorites/:siteId
 * Idempotent — removing a non-favorite site is a 200 no-op.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const removed = store.removeSiteFavorite(siteId);
  return NextResponse.json({ site_id: siteId, is_favorite: false, removed });
}
