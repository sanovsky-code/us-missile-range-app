"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Map, Loader2, Download } from "lucide-react";

interface UploadResult {
  success: boolean;
  counts?: {
    sites: number;
    radars: number;
    activities: number;
    sources: number;
    contacts: number;
  };
  errors: Array<{
    sheet: string;
    row: number;
    field: string;
    value: string;
    message: string;
    severity: string;
  }>;
  warnings: Array<{
    sheet: string;
    row: number;
    field: string;
    value: string;
    message: string;
    severity: string;
  }>;
  error?: string;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, errors: [], warnings: [], error: "הטעינה נכשלה" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">טעינת נתוני אקסל</h1>
        <p className="text-gray-600 mb-4">
          העלה קובץ אקסל (.xlsx) עם גליונות Sites, Radars, Site_Activities, Sources ו-Contacts.
        </p>
        <div className="mb-6">
          <a
            href="/api/download"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium border border-gray-200"
          >
            <Download className="w-4 h-4" /> הורד את קובץ הנתונים הנוכחי
          </a>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <label className="cursor-pointer">
              <span className="text-blue-600 hover:text-blue-800 font-medium">בחר קובץ</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                }}
              />
            </label>
            {file && (
              <p className="mt-3 text-sm text-gray-700 font-medium">
                נבחר: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> מעבד...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" /> העלה ואמת
              </>
            )}
          </button>
        </div>

        {result && (
          <div className="mt-6 space-y-4">
            {result.error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{result.error}</p>
              </div>
            ) : result.success ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <h3 className="font-semibold text-green-800">הייבוא הצליח!</h3>
                </div>
                <div className="grid grid-cols-5 gap-4 mb-4">
                  {result.counts && (
                    <>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-700">{result.counts.sites}</p>
                        <p className="text-xs text-green-600">אתרים</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-700">{result.counts.radars}</p>
                        <p className="text-xs text-green-600">מכ&quot;מים</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-700">{result.counts.activities}</p>
                        <p className="text-xs text-green-600">פעילויות</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-700">{result.counts.sources}</p>
                        <p className="text-xs text-green-600">מקורות</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-700">{result.counts.contacts}</p>
                        <p className="text-xs text-green-600">אנשי קשר</p>
                      </div>
                    </>
                  )}
                </div>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  <Map className="w-4 h-4" /> צפייה במפה
                </Link>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800">
                    האימות נכשל ({result.errors.length} שגיאות)
                  </h3>
                  <p className="text-sm text-red-600 mt-1">
                    תקן את השגיאות להלן והעלה מחדש.
                  </p>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <h3 className="px-4 py-3 bg-red-50 text-sm font-semibold text-red-800 border-b border-red-100">
                  שגיאות ({result.errors.length})
                </h3>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">גליון</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">שורה</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">שדה</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">הודעה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((err, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-700">{err.sheet}</td>
                          <td className="px-3 py-2 text-gray-700">{err.row}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">{err.field}</td>
                          <td className="px-3 py-2 text-red-700">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <h3 className="px-4 py-3 bg-yellow-50 text-sm font-semibold text-yellow-800 border-b border-yellow-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> אזהרות ({result.warnings.length})
                </h3>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">גליון</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">שורה</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">שדה</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">הודעה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.warnings.map((warn, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-700">{warn.sheet}</td>
                          <td className="px-3 py-2 text-gray-700">{warn.row}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">{warn.field}</td>
                          <td className="px-3 py-2 text-yellow-700">{warn.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
