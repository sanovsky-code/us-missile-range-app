import Link from "next/link";
import { Source } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import { BookOpen, ExternalLink, Eye } from "lucide-react";

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

export default function SourcesSection({ sources }: { sources: Source[] }) {
  if (!sources || sources.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">מקורות</h2>
        <p className="text-sm text-gray-500">אין מקורות מידע זמינים.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          מקורות ({sources.length})
        </h2>
      </div>
      <div className="space-y-3">
        {sources.map((source) => (
          <Link
            key={source.source_id}
            href={`/source/${source.source_id}`}
            target="_blank"
            rel="noopener noreferrer"
            id={`source-${source.source_id}`}
            className="flex items-start justify-between gap-4 border border-gray-100 rounded-lg p-3 scroll-mt-20 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge color={typeColors[source.source_type] || "gray"}>
                  {typeHebrew[source.source_type] || source.source_type}
                </Badge>
                <span className="text-xs text-gray-400 font-mono" dir="ltr">{source.source_id}</span>
                {source.reliability_score && (
                  <span className="text-xs text-gray-400">
                    מהימנות: {source.reliability_score}%
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 text-left group-hover:text-blue-700" dir="ltr">{source.source_title}</p>
              {source.publisher && (
                <p className="text-xs text-gray-500 text-left" dir="ltr">{source.publisher}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                גישה: {source.access_date}
                {source.publication_date && ` | פרסום: ${source.publication_date}`}
              </p>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <div className="p-2 text-blue-500 group-hover:bg-blue-100 rounded-lg" title="צפייה בעמוד המקור">
                <Eye className="w-4 h-4" />
              </div>
              {source.source_url && (
                <a
                  href={source.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  title="פתח ישירות באתר המקור"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
