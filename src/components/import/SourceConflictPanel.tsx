"use client";

import { AlertTriangle } from "lucide-react";
import type { SourceConflictResult, UserSourceResolution } from "@/lib/excel-import";

interface Props {
  conflictResult: SourceConflictResult | null;
  resolutions: Record<string, UserSourceResolution>;
  onChange: (sourceId: string, res: UserSourceResolution) => void;
  /** When true the operator may pick UPDATE_EXISTING. Default false. */
  showAdvanced: boolean;
  onToggleAdvanced: (on: boolean) => void;
}

export default function SourceConflictPanel({
  conflictResult,
  resolutions,
  onChange,
  showAdvanced,
  onToggleAdvanced,
}: Props) {
  if (!conflictResult) return null;
  const { referencedSourceIds, willCreate, willReuse, conflicts } = conflictResult;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">מקורות מידע רלוונטיים</h3>
        <p className="text-sm text-gray-600 mb-3">
          רק מקורות שמוזכרים ברשומות שבחרת ייובאו. שאר השורות בגיליון Sources מתעלמים מהן.
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
            <div className="text-gray-500 text-xs">סה&quot;כ מזהי מקור ברשומות שנבחרו</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{referencedSourceIds.length}</div>
          </div>
          <div className="p-3 rounded-md bg-green-50 border border-green-200">
            <div className="text-green-700 text-xs">יוצרו כמקור חדש</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{willCreate.length}</div>
          </div>
          <div className="p-3 rounded-md bg-blue-50 border border-blue-200">
            <div className="text-blue-700 text-xs">יעשו שימוש במקור קיים</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{willReuse.length}</div>
          </div>
        </div>
      </div>

      {conflicts.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-amber-900">קונפליקט מקור ({conflicts.length})</h3>
              <p className="text-sm text-amber-800 mt-1">
                קיים מקור עם אותו Source ID, אך הכותרת או הכתובת שונות. מומלץ ליצור מקור חדש עם Source ID חדש כדי לא לפגוע במידע קיים.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <input
              id="advancedToggle"
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => onToggleAdvanced(e.target.checked)}
            />
            <label htmlFor="advancedToggle" className="text-sm text-amber-900">
              הצג אפשרות מתקדמת: <strong>עדכן מקור קיים</strong> (לא מומלץ — דורש אישור נוסף)
            </label>
          </div>

          <div className="space-y-3">
            {conflicts.map((c) => {
              const res = resolutions[c.original_source_id]?.resolution ?? "CREATE_NEW";
              return (
                <div key={c.original_source_id} className="bg-white border border-amber-200 rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-medium text-gray-900" dir="ltr">{c.original_source_id}</span>
                    <span className="text-xs text-amber-700">דורש החלטה</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 text-xs mb-3">
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-gray-500 mb-1 font-semibold">קיים ב־SQLite</div>
                      <div className="text-gray-800"><strong>כותרת:</strong> {c.existing?.source_title ?? "(ריק)"}</div>
                      <div className="text-gray-800 truncate" dir="ltr" title={c.existing?.source_url ?? ""}>
                        <strong>כתובת:</strong> {c.existing?.source_url ?? "(ריק)"}
                      </div>
                    </div>
                    <div className="p-2 bg-amber-50 rounded">
                      <div className="text-amber-700 mb-1 font-semibold">בקובץ האקסל</div>
                      <div className="text-gray-800"><strong>כותרת:</strong> {c.excel?.source_title ?? "(ריק)"}</div>
                      <div className="text-gray-800 truncate" dir="ltr" title={c.excel?.source_url ?? ""}>
                        <strong>כתובת:</strong> {c.excel?.source_url ?? "(ריק)"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`res-${c.original_source_id}`}
                        checked={res === "CREATE_NEW"}
                        onChange={() => onChange(c.original_source_id, { resolution: "CREATE_NEW" })}
                      />
                      <span className="text-sm text-gray-900">צור מקור חדש <span className="text-xs text-gray-500">(ברירת מחדל)</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`res-${c.original_source_id}`}
                        checked={res === "REUSE_EXISTING"}
                        onChange={() => onChange(c.original_source_id, { resolution: "REUSE_EXISTING" })}
                      />
                      <span className="text-sm text-gray-900">השתמש במקור הקיים</span>
                    </label>
                    {showAdvanced && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`res-${c.original_source_id}`}
                          checked={res === "UPDATE_EXISTING"}
                          onChange={() => {
                            if (confirm("האם אתה בטוח שברצונך לעדכן את המקור הקיים? פעולה זו תחליף את הכותרת והכתובת הקיימות.")) {
                              onChange(c.original_source_id, { resolution: "UPDATE_EXISTING" });
                            }
                          }}
                        />
                        <span className="text-sm text-red-700">עדכן מקור קיים (מתקדם)</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          לא נמצאו קונפליקטים של מקורות. כל המקורות שמתייחסים אליהם מתאימים אוטומטית.
        </div>
      )}
    </div>
  );
}
