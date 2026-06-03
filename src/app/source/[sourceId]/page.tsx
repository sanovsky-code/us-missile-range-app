"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Source } from "@/lib/types";
import { ExternalLink, ArrowRight, Loader2, AlertCircle, FileText, Globe, BookOpen } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface CitedSite {
  site_id: string;
  site_name: string;
  country: string;
  site_type: string;
  size_category: string;
}

const typeColors: Record<string, string> = {
  Official: "green",
  Government: "blue",
  Contractor: "purple",
  News: "orange",
  Academic: "yellow",
  Industry: "gray",
  Other: "gray",
};

const typeHebrew: Record<string, string> = {
  Official: "רשמי",
  Government: "ממשלתי",
  Contractor: "קבלן",
  News: "חדשות",
  Academic: "אקדמי",
  Industry: "תעשייה",
  Other: "אחר",
};

function isPdf(url: string): boolean {
  return url.toLowerCase().includes(".pdf");
}

export default function SourceViewerPage() {
  const params = useParams();
  const sourceId = params.sourceId as string;
  const [source, setSource] = useState<Source | null>(null);
  const [sites, setSites] = useState<CitedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/sources/${sourceId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Source not found");
        return res.json();
      })
      .then((data) => {
        setSource(data.source);
        setSites(data.sites || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [sourceId]);

  // Detect iframe load failure via timeout - if 4s after mount it never loaded,
  // the site probably blocks embedding (X-Frame-Options or CSP frame-ancestors).
  useEffect(() => {
    if (!source?.source_url) return;
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [source, iframeLoaded]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-600">{error || "המקור לא נמצא"}</p>
        <Link href="/map" className="text-blue-600 hover:text-blue-800 font-medium">
          חזרה למפה
        </Link>
      </div>
    );
  }

  const url = source.source_url || "";
  const hasUrl = !!url;
  const pdf = hasUrl && isPdf(url);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge color={typeColors[source.source_type] || "gray"}>
                  {typeHebrew[source.source_type] || source.source_type}
                </Badge>
                <span className="text-xs text-gray-500" dir="ltr">{source.source_id}</span>
                {pdf ? (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </span>
                ) : hasUrl ? (
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <Globe className="w-3.5 h-3.5" /> Web Page
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <BookOpen className="w-3.5 h-3.5" /> מסמך פנימי
                  </span>
                )}
              </div>
              <h1 className="text-lg font-bold text-gray-900 leading-snug" dir="ltr" style={{ textAlign: "left" }}>
                {source.source_title}
              </h1>
              {source.publisher && (
                <p className="text-sm text-gray-500 mt-1" dir="ltr" style={{ textAlign: "left" }}>
                  {source.publisher}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/map"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <ArrowRight className="w-4 h-4" /> מפה
              </Link>
              {hasUrl && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  פתח במקור <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
          {sites.length > 0 && (
            <div className="text-xs text-gray-500">
              מצוטט ב-{sites.length} אתרים:{" "}
              {sites.slice(0, 8).map((s, i) => (
                <span key={s.site_id}>
                  <Link href={`/site/${s.site_id}`} className="text-blue-600 hover:underline" dir="ltr">
                    {s.site_name}
                  </Link>
                  {i < Math.min(sites.length, 8) - 1 ? ", " : ""}
                </span>
              ))}
              {sites.length > 8 && <span>, ועוד {sites.length - 8}...</span>}
            </div>
          )}
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-hidden">
        {!hasUrl ? (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-md text-center p-8 bg-white rounded-xl shadow-sm border border-gray-200">
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">מסמך פנימי</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                המקור הוזן כמסמך פנימי ל-NotebookLM ואינו זמין בכתובת URL ציבורית.
                התוכן שצוטט מתוכו מופיע בתיאורי האתרים.
              </p>
            </div>
          </div>
        ) : iframeBlocked ? (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-md text-center p-8 bg-white rounded-xl shadow-sm border border-gray-200">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">לא ניתן להציג כאן</h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                האתר חוסם הטמעה (X-Frame-Options / CSP). לחץ על הכפתור למטה כדי לפתוח במקור.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                פתח במקור <ExternalLink className="w-4 h-4" />
              </a>
              <p className="text-xs text-gray-400 mt-4 font-mono break-all" dir="ltr">{url}</p>
            </div>
          </div>
        ) : (
          <iframe
            src={url}
            className="w-full h-full border-0 bg-white"
            title={source.source_title}
            onLoad={() => setIframeLoaded(true)}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  );
}
