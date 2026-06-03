import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/sites/:siteId/comments → newest-first history of comments. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ comments: store.listCommentsForSite(siteId) });
}

/** POST /api/sites/:siteId/comments → append a new comment (no overwrite). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = (await request.json()) as { comment_text?: string; created_by?: string };
    const store = getDataStore();
    await store.ensureLoaded();
    const comment = store.addComment(siteId, body.comment_text ?? "", body.created_by);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add comment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
