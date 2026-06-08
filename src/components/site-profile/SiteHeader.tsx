import { Site } from "@/lib/types";
import { SizeBadge, ConfidenceBadge, StatusBadge } from "@/components/ui/Badge";
import FavoriteButton from "@/components/site-profile/FavoriteButton";
import { MapPin, Building2, Shield } from "lucide-react";

export default function SiteHeader({ site }: { site: Site }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-left" dir="ltr">{site.site_name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" /> <span dir="ltr">{site.state}</span>
            </span>
            <span className="flex items-center gap-1">
              <Shield className="w-4 h-4" /> <span dir="ltr">{site.site_type}</span>
            </span>
            {site.operator && (
              <span className="flex items-center gap-1">
                <Building2 className="w-4 h-4" /> <span dir="ltr">{site.operator}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <FavoriteButton siteId={site.site_id} initialIsFavorite={site.is_favorite ?? false} />
          <SizeBadge sizeCategory={site.size_category} />
          <ConfidenceBadge level={site.confidence_level} />
          <StatusBadge status={site.record_status} />
        </div>
      </div>
      {site.size_score && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">ציון גודל:</span>
          <div className="flex-1 max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-green-400 via-blue-500 to-red-500"
              style={{ width: `${site.size_score}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700">{site.size_score}/100</span>
        </div>
      )}
    </div>
  );
}
