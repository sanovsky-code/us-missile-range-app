import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/radar-favorites/:radarId → { is_favorite: boolean } */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ radarId: string }> },
) {
  const { radarId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ radar_id: radarId, is_favorite: store.isRadarFavorite(radarId) });
}

/** POST /api/radar-favorites/:radarId. Idempotent. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ radarId: string }> },
) {
  const { radarId } = await params;
  let body: { created_by?: string; notes?: string } = {};
  try {
    if (request.headers.get("content-length")) {
      body = (await request.json()) as { created_by?: string; notes?: string };
    }
  } catch { /* empty/invalid body → defaults */ }
  try {
    const store = getDataStore();
    await store.ensureLoaded();
    const inserted = store.addRadarFavorite(radarId, body);
    return NextResponse.json(
      { radar_id: radarId, is_favorite: true, inserted },
      { status: inserted ? 201 : 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add favorite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/radar-favorites/:radarId. Idempotent. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ radarId: string }> },
) {
  const { radarId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const removed = store.removeRadarFavorite(radarId);
  return NextResponse.json({ radar_id: radarId, is_favorite: false, removed });
}
