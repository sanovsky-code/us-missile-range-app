"use client";

/**
 * "ייבוא נתונים" — selective import wizard, redesigned.
 *
 * Flow:
 *   1. Upload .xlsx              POST /api/import/parse
 *   2. Scan + select changes     POST /api/import/scan   → SiteChangeTree
 *   3. Resolve source conflicts  POST /api/import/multi-source-conflicts
 *   4. Preview the diff          POST /api/import/multi-preview
 *   5. Apply                     POST /api/import/multi-apply → summary
 *
 * Only the changes the user ticked in Step 2 are touched. Sources are
 * limited to the SRC-ids referenced by those ticked rows.
 */
import { useMemo, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import StepIndicator, { Step } from "@/components/import/StepIndicator";
import SiteChangeTree from "@/components/import/SiteChangeTree";
import SourceConflictPanel from "@/components/import/SourceConflictPanel";
import PreviewDiff from "@/components/import/PreviewDiff";
import type {
  ParseResult,
  ScanResult,
  SourceConflictResult,
  UserSourceResolution,
  MultiSelectiveImportReport,
} from "@/lib/excel-import";

const STEPS: Step[] = [
  { id: "upload",   label: "בחירת קובץ אקסל" },
  { id: "scan",     label: "בחירת רשומות לעדכון" },
  { id: "sources",  label: "מקורות מידע" },
  { id: "preview",  label: "תצוגה מקדימה" },
  { id: "summary",  label: "סיכום ייבוא" },
];

type WizardError = { message: string };

export default function ImportWizardPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<WizardError | null>(null);
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [conflictResult, setConflictResult] = useState<SourceConflictResult | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, UserSourceResolution>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewReport, setPreviewReport] = useState<MultiSelectiveImportReport | null>(null);
  const [applyReport, setApplyReport] = useState<MultiSelectiveImportReport | null>(null);

  const totalChangesDetected = useMemo(() => {
    if (!scan) return 0;
    return scan.sites.reduce((s, n) => s + (n.siteChange ? 1 : 0) + n.radars.length + n.activities.length + n.contacts.length, 0);
  }, [scan]);

  const resetFromStep = (idx: number) => {
    if (idx <= 1) { setConflictResult(null); setResolutions({}); }
    if (idx <= 2) setPreviewReport(null);
    if (idx <= 3) setApplyReport(null);
    setStepIndex(idx);
    setError(null);
  };

  // --- Step 0: upload + auto-scan ---
  const handleUploadAndScan = async () => {
    if (!file) { setError({ message: "בחר קובץ .xlsx תחילה." }); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      let res = await fetch("/api/import/parse", { method: "POST", body: fd });
      let json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const parseResult = json.result as ParseResult;
      setParsed(parseResult);

      const blocking = parseResult.issues.find((i) => i.severity === "error");
      if (blocking) { setError({ message: blocking.message }); return; }

      res = await fetch("/api/import/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed: parseResult, allowCreateSites: true }),
      });
      json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setScan(json.result as ScanResult);
      setSelectedKeys(new Set());
      setStepIndex(1);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally { setBusy(false); }
  };

  // --- Step 1 → 2: detect source conflicts ---
  const handleDetectConflicts = async () => {
    if (!parsed || selectedKeys.size === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import/multi-source-conflicts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed, selectedKeys: Array.from(selectedKeys), allowCreateSites: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const result = json.result as SourceConflictResult;
      setConflictResult(result);
      const defaults: Record<string, UserSourceResolution> = {};
      for (const c of result.conflicts) defaults[c.original_source_id] = { resolution: "CREATE_NEW" };
      setResolutions(defaults);
      setStepIndex(2);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally { setBusy(false); }
  };

  // --- Step 2 → 3: preview ---
  const handlePreview = async () => {
    if (!parsed) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import/multi-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed,
          selectedKeys: Array.from(selectedKeys),
          sourceResolutions: resolutions,
          allowCreateSites: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPreviewReport(json.report as MultiSelectiveImportReport);
      setStepIndex(3);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally { setBusy(false); }
  };

  // --- Step 3 → 4: apply ---
  const handleApply = async () => {
    if (!parsed) return;
    if (!confirm("הפעלת ייבוא תשנה את מסד הנתונים. גיבוי יווצר אוטומטית. להמשיך?")) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import/multi-apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed,
          selectedKeys: Array.from(selectedKeys),
          sourceResolutions: resolutions,
          allowCreateSites: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setApplyReport(json.report as MultiSelectiveImportReport);
      setStepIndex(4);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const resetAll = () => {
    setStepIndex(0); setFile(null); setParsed(null); setScan(null);
    setSelectedKeys(new Set()); setConflictResult(null); setResolutions({});
    setPreviewReport(null); setApplyReport(null); setError(null);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ייבוא נתונים</h1>
        <p className="text-sm text-gray-600 mb-6">
          עדכון מבוקר של מסד הנתונים מקובץ אקסל. נסרק רק שינויים אמיתיים — רשומות זהות אינן מוצגות. רק רשומות שסומנו כאן ייובאו.
        </p>

        <StepIndicator steps={STEPS} current={stepIndex} />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">{error.message}</div>
          </div>
        )}

        {/* Step 0 — upload */}
        {stepIndex === 0 && (
          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">בחר קובץ .xlsx לעדכון</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setParsed(null); setScan(null); }}
                  className="block w-full text-sm text-gray-700 file:ml-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:cursor-pointer"
                />
                {file && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <FileSpreadsheet className="w-4 h-4" /> {file.name}
                  </span>
                )}
              </div>
            </label>
            <div className="mt-6">
              <button
                disabled={!file || busy}
                onClick={handleUploadAndScan}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                בדיקת קובץ והשוואה למסד
              </button>
            </div>
          </section>
        )}

        {/* Step 1 — site change tree */}
        {stepIndex === 1 && scan && (
          <section className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">בחירת רשומות לעדכון</h2>
                <p className="text-xs text-gray-600 mt-1">
                  {totalChangesDetected === 0
                    ? "לא נמצאו שינויים בין הקובץ למסד."
                    : `זוהו ${totalChangesDetected} שינויים פוטנציאליים: ${scan.totals.sites} אתרים, ${scan.totals.radars} ראדרים, ${scan.totals.activities} פעילויות, ${scan.totals.contacts} אנשי קשר.`}
                </p>
              </div>
            </div>
            <SiteChangeTree scan={scan} selected={selectedKeys} onChange={setSelectedKeys} />
            <NavButtons
              onBack={() => resetFromStep(0)}
              onNext={handleDetectConflicts}
              nextDisabled={selectedKeys.size === 0 || busy}
              nextLabel={busy ? "טוען..." : "המשך לטיפול במקורות"}
              statusText={selectedKeys.size === 0
                ? "סמן רשומות אחת או יותר כדי להמשיך"
                : `${selectedKeys.size} רשומות נבחרו לייבוא`}
            />
          </section>
        )}

        {/* Step 2 — source conflicts */}
        {stepIndex === 2 && conflictResult && (
          <section className="space-y-4">
            <SourceConflictPanel
              conflictResult={conflictResult}
              resolutions={resolutions}
              onChange={(sid, r) => setResolutions((prev) => ({ ...prev, [sid]: r }))}
              showAdvanced={showAdvanced}
              onToggleAdvanced={setShowAdvanced}
            />
            <NavButtons
              onBack={() => resetFromStep(1)}
              onNext={handlePreview}
              nextDisabled={busy}
              nextLabel={busy ? "טוען..." : "תצוגה מקדימה"}
              statusText={conflictResult.conflicts.length > 0
                ? `${conflictResult.conflicts.length} קונפליקטים — ${conflictResult.willCreate.length} ייווצרו · ${conflictResult.willReuse.length} שימוש חוזר`
                : `${conflictResult.referencedSourceIds.length} מקורות — ${conflictResult.willCreate.length} ייווצרו · ${conflictResult.willReuse.length} שימוש חוזר`}
            />
          </section>
        )}

        {/* Step 3 — preview */}
        {stepIndex === 3 && previewReport && (
          <section className="space-y-4">
            <PreviewDiff report={previewReport} />
            <NavButtons
              onBack={() => resetFromStep(2)}
              onNext={handleApply}
              nextDisabled={busy || previewReport.totals.errorCount > 0}
              nextLabel={busy ? "מבצע ייבוא..." : "הפעל ייבוא"}
              nextStyle="danger"
              statusText={previewReport.totals.errorCount > 0
                ? `${previewReport.totals.errorCount} שגיאות — לא ניתן לבצע ייבוא`
                : `${previewReport.totals.createdCount} ליצירה · ${previewReport.totals.updatedCount} לעדכון`}
            />
            {previewReport.totals.errorCount > 0 && (
              <p className="text-sm text-red-700">
                ישנן שגיאות ולידציה. תקן את הקובץ או דלג על הרשומות הבעייתיות לפני ההפעלה.
              </p>
            )}
          </section>
        )}

        {/* Step 4 — summary */}
        {stepIndex === 4 && applyReport && (
          <section className="space-y-4">
            <div className={
              "bg-white border rounded-lg p-6 " +
              (applyReport.status === "Completed" ? "border-green-200" : "border-red-200")
            }>
              <div className="flex items-center gap-3 mb-4">
                {applyReport.status === "Completed" ? (
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">סיכום ייבוא</h2>
                  <p className="text-sm text-gray-600">
                    סטטוס:{" "}
                    <strong className={applyReport.status === "Completed" ? "text-green-700" : "text-red-700"}>
                      {applyReport.status}
                    </strong>{" "}
                    · קובץ: <span dir="ltr">{applyReport.fileName}</span>{" "}
                    · בתי: {new Date(applyReport.completedAt ?? applyReport.startedAt).toLocaleString("he-IL")}
                  </p>
                </div>
              </div>
              {applyReport.backupPath && (
                <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                  גיבוי נוצר בהצלחה: <span className="font-mono" dir="ltr">{applyReport.backupPath}</span>
                </div>
              )}
              {applyReport.errorMessage && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  {applyReport.errorMessage}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {(["sites","radars","activities","contacts"] as const).map((k) => (
                  <div key={k} className="border border-gray-200 rounded-md p-2">
                    <div className="text-xs text-gray-500">{k}</div>
                    <div className="text-gray-900">
                      {applyReport.perType[k].create} חדשים · {applyReport.perType[k].update} עודכנו · {applyReport.perType[k].skip} דולגו
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <PreviewDiff report={applyReport} />
            <button
              onClick={resetAll}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md"
            >
              התחל ייבוא חדש
            </button>
          </section>
        )}
      </div>
    </main>
  );
}


function NavButtons({
  onBack, onNext, nextDisabled, nextLabel, nextStyle, statusText,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  nextStyle?: "primary" | "danger";
  /** Optional short hint shown between the back and next buttons (e.g.
   * "107 רשומות נבחרו"). Keeps the user informed without scrolling. */
  statusText?: string;
}) {
  const danger = nextStyle === "danger";
  // Sticky action bar: always visible even when the content scrolls past
  // multiple screens of site cards. The bar sits at the bottom of the
  // viewport with a soft top shadow so it reads as a fixed footer.
  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.06)] z-20">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
        >
          <ArrowRight className="w-4 h-4" />
          חזור
        </button>
        {statusText && (
          <span className="text-sm text-gray-600 hidden sm:inline truncate">{statusText}</span>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={
            "inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed " +
            (danger
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white")
          }
        >
          {nextLabel ?? "המשך"}
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
