import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();

  const source = store.getSourceById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const sites = store.getSitesCitingSource(sourceId).map((s) => ({
    site_id: s.site_id,
    site_name: s.site_name,
    country: s.country,
    site_type: s.site_type,
    size_category: s.size_category,
  }));

  return NextResponse.json({ source, sites });
}
