import { NextResponse } from "next/server";
import os from "os";

/**
 * GET /api/system/username
 *
 * Returns the OS username of the user running the dev/prod server, used by
 * the client to pre-fill the welcome identity modal on first launch. This
 * is NOT authentication — it's a friendly default for a local-first app
 * where every user has their own machine. The client can override the
 * pre-filled value before saving it to localStorage.
 *
 * Falls back to an empty string if the OS API is unavailable for any
 * reason; the client then shows an empty input.
 */
export async function GET() {
  try {
    const info = os.userInfo();
    return NextResponse.json({ username: info.username ?? "" });
  } catch {
    return NextResponse.json({ username: "" });
  }
}
