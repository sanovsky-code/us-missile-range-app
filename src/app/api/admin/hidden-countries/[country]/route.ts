import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/**
 * DELETE /api/admin/hidden-countries/:country
 * Un-hide a country. Idempotent. URL-decoded so `Saudi%20Arabia` works.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ country: string }> },
) {
  const { country } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const removed = store.removeHiddenCountry(decodeURIComponent(country));
  return NextResponse.json({ country: decodeURIComponent(country), hidden: false, removed });
}
