import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { buildWorkbook } from "@/lib/excel-writer";

/**
 * Streams a fresh .xlsx export built from the current SQLite contents.
 * Customers can use it as a human-readable backup of the database.
 */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  const { sites, radars, activities, sources, contacts } = store.getAll();

  const buffer = await buildWorkbook(sites, radars, activities, sources, contacts);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="us_missile_range_export_${today}.xlsx"`,
    },
  });
}
