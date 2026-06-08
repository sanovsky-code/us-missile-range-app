"use client";

import type { SelectiveImportReport, MultiSelectiveImportReport } from "@/lib/excel-import";

export default function PreviewDiff({ report }: { report: SelectiveImportReport | MultiSelectiveImportReport }) {
  const changed = report.decisions.filter((d) => d.action === "Create" || d.action === "Update");
  const skipped = report.decisions.filter((d) => d.action === "Skip");

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-3">
        <SummaryTile label="ליצירה" value={report.totals.createdCount} color="green" />
        <SummaryTile label="לעדכון" value={report.totals.updatedCount} color="blue" />
        <SummaryTile label="ידולג" value={report.totals.skippedCount} color="yellow" />
        <SummaryTile label="שגיאות" value={report.totals.errorCount} color="red" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <SummaryTile label="מקורות חדשים" value={report.totals.sourceCreatedCount} color="green" small />
        <SummaryTile label="מקורות לשימוש חוזר" value={report.totals.sourceReusedCount} color="blue" small />
        <SummaryTile label="קונפליקטים שטופלו" value={report.totals.sourceConflictCount} color="yellow" small />
      </div>

      {report.sourceActions.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">פעולות על מקורות</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-700 border-b border-gray-200">
                <th className="py-1.5 px-2 font-medium">Source ID (מקורי)</th>
                <th className="py-1.5 px-2 font-medium">החלטה</th>
                <th className="py-1.5 px-2 font-medium">Source ID חדש</th>
              </tr>
            </thead>
            <tbody>
              {report.sourceActions.map((a) => (
                <tr key={a.original_source_id} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-mono" dir="ltr">{a.original_source_id}</td>
                  <td className="py-1.5 px-2">{renderResolutionLabel(a.resolution)}</td>
                  <td className="py-1.5 px-2 font-mono" dir="ltr">{a.new_source_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {changed.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">שינויי שדות ({changed.length})</h3>
          <div className="space-y-3 max-h-[420px] overflow-auto">
            {changed.map((d, idx) => (
              <article key={`${d.entityType}-${d.entityId}-${idx}`} className="border border-gray-100 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={
                    "px-2 py-0.5 rounded-md text-xs font-semibold " +
                    (d.action === "Create" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")
                  }>
                    {d.action === "Create" ? "יצירה" : "עדכון"}
                  </span>
                  <span className="text-sm text-gray-700">{d.entityType}</span>
                  <span className="font-mono text-sm text-gray-900" dir="ltr">{d.entityId}</span>
                  <span className="text-xs text-gray-400">(גיליון {d.sheetName}, שורה {d.rowNumber})</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="py-1 px-1.5 text-right font-medium w-40">שדה</th>
                      <th className="py-1 px-1.5 text-right font-medium">ערך קיים</th>
                      <th className="py-1 px-1.5 text-right font-medium">ערך חדש</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fields.map((f) => (
                      <tr key={f.field} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-1 px-1.5 text-gray-800 font-mono">
                          {f.field}
                          {f.isProtected && <span className="text-amber-600 text-[10px] mr-1">[מוגן]</span>}
                          {f.isClear && <span className="text-orange-600 text-[10px] mr-1">[ניקוי]</span>}
                        </td>
                        <td className="py-1 px-1.5 text-gray-600 max-w-xs truncate" title={String(f.oldValue ?? "")}>
                          {f.oldValue === null ? <span className="text-gray-400 italic">(ריק)</span> : String(f.oldValue)}
                        </td>
                        <td className="py-1 px-1.5 text-gray-900 max-w-xs truncate" title={String(f.newValue ?? "")}>
                          {f.newValue === null ? <span className="text-gray-400 italic">(ריק)</span> : String(f.newValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        </section>
      )}

      {skipped.length > 0 && (
        <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-yellow-900 mb-2">דילוגים ({skipped.length})</h3>
          <ul className="text-sm text-yellow-800 space-y-1">
            {skipped.slice(0, 12).map((d, i) => (
              <li key={i}>
                שורה {d.rowNumber} — <span className="font-mono">{d.entityId || "(ללא מזהה)"}</span>:{" "}
                {d.errors.filter((e) => e.severity === "error").map((e) => e.message).join("; ") || "ללא שינויים"}
              </li>
            ))}
            {skipped.length > 12 && <li>…ועוד {skipped.length - 12}.</li>}
          </ul>
        </section>
      )}

      {report.issues.filter((i) => i.severity === "error").length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-red-900 mb-2">שגיאות ולידציה</h3>
          <ul className="text-sm text-red-800 space-y-1">
            {report.issues.filter((i) => i.severity === "error").slice(0, 20).map((i, idx) => (
              <li key={idx}>
                <span className="font-mono">[{i.sheet} שורה {i.row}]</span> {i.field}: {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function renderResolutionLabel(r: "REUSE_EXISTING" | "CREATE_NEW" | "UPDATE_EXISTING"): React.ReactNode {
  if (r === "CREATE_NEW") return <span className="text-green-700">צור חדש</span>;
  if (r === "REUSE_EXISTING") return <span className="text-blue-700">שימוש חוזר</span>;
  return <span className="text-red-700">עדכון קיים</span>;
}

function SummaryTile({ label, value, color, small }: { label: string; value: number; color: "green" | "blue" | "yellow" | "red"; small?: boolean }) {
  const colors = {
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={"p-3 rounded-lg border " + colors[color]}>
      <div className="text-xs">{label}</div>
      <div className={(small ? "text-xl" : "text-2xl") + " font-bold mt-1"}>{value}</div>
    </div>
  );
}
