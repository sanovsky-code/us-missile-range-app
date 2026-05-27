import { Source } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import { BookOpen, ExternalLink } from "lucide-react";

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
          <div
            key={source.source_id}
            className="flex items-start justify-between gap-4 border border-gray-100 rounded-lg p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge color={typeColors[source.source_type] || "gray"}>
                  {typeHebrew[source.source_type] || source.source_type}
                </Badge>
                {source.reliability_score && (
                  <span className="text-xs text-gray-400">
                    מהימנות: {source.reliability_score}%
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900">{source.source_title}</p>
              {source.publisher && (
                <p className="text-xs text-gray-500">{source.publisher}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                גישה: {source.access_date}
                {source.publication_date && ` | פרסום: ${source.publication_date}`}
              </p>
            </div>
            <a
              href={source.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
