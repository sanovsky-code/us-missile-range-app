import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/contacts/:id/history — field-change feed for a user-managed
 * site contact. Reads from contact_field_history filtered to
 * kind="site_contact". */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ history: store.listContactHistory("site_contact", id) });
}
