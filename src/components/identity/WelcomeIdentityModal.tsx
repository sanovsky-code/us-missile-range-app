"use client";

/**
 * First-launch welcome dialog that captures the operator's name. Used by
 * CurrentUserProvider both on first launch (pre-filled from the OS username)
 * and on "החלף משתמש" clicks (pre-filled from the current value).
 */
import { useEffect, useState } from "react";
import { User, Loader2 } from "lucide-react";

interface Props {
  /** Pre-filled value: OS username on first launch, current identity on switch. */
  initialValue: string;
  /** Drives the wording — first-launch shows a welcome message, switch shows
   * an "החלף משתמש" header. */
  isFirstLaunch: boolean;
  onSave: (name: string) => void;
  /** No-op on first launch (operator must save) — UI hides the cancel button
   * in that mode. */
  onCancel: () => void;
}

export default function WelcomeIdentityModal({ initialValue, isFirstLaunch, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  // If the OS username arrives asynchronously after the modal opened with an
  // empty string, sync the input so the pre-fill still happens.
  useEffect(() => { setValue(initialValue); }, [initialValue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isFirstLaunch) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFirstLaunch, onCancel]);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    onSave(v);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b bg-gradient-to-l from-blue-50 to-white">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">
              {isFirstLaunch ? "ברוך הבא" : "החלפת משתמש"}
            </h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {isFirstLaunch
              ? "השם הזה יופיע בתיעוד כל שינוי שתבצע באפליקציה."
              : "עדכן את השם שיופיע בתיעוד השינויים."}
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">שם להצגה</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="לדוגמה: אורן ש."
              autoFocus
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded"
              dir="auto"
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              נשמר במכשיר הזה בלבד. ניתן להחליף בכל עת מתפריט העליון.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          {!isFirstLaunch && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
            >
              ביטול
            </button>
          )}
          <button
            onClick={submit}
            disabled={busy || !value.trim()}
            className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            שמור והמשך
          </button>
        </div>
      </div>
    </div>
  );
}
