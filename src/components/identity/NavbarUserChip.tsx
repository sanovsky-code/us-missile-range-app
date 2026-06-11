"use client";

/**
 * Small "logged in as" chip rendered at the end of the navbar. Salesforce-
 * style: shows the current operator and an "החלף" link that re-opens the
 * welcome modal pre-filled with the current name.
 */
import { User } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";

export default function NavbarUserChip() {
  const { currentUser, openSwitcher, ready } = useCurrentUser();
  // Skip rendering on first paint so SSR/CSR hydration doesn't flash an
  // empty chip. The modal handles first-launch capture on its own.
  if (!ready) return null;

  return (
    <div className="mr-auto flex items-center gap-2 text-sm">
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded-md text-slate-200">
        <User className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs">מחובר כ:</span>
        <span className="font-medium" dir="auto">{currentUser || "—"}</span>
      </div>
      <button
        onClick={openSwitcher}
        className="text-xs text-slate-400 hover:text-white underline-offset-2 hover:underline"
        title="החלף משתמש"
      >
        החלף
      </button>
    </div>
  );
}
