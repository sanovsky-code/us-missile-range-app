import Link from "next/link";
import { SiteListItem } from "@/lib/types";
import { SIZE_CATEGORY_COLORS } from "@/lib/constants";
import { MapPin, Radio, Activity, ExternalLink } from "lucide-react";

const sizeHebrew: Record<string, string> = {
  Small: "קטן",
  Medium: "בינוני",
  Large: "גדול",
  "Strategic / Mega": "אסטרטגי",
};

export default function SitePopupCard({ site }: { site: SiteListItem }) {
  const sizeColor = SIZE_CATEGORY_COLORS[site.size_category] || "#6b7280";

  return (
    <div className="min-w-[280px] max-w-[320px]" dir="rtl">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm leading-tight" dir="ltr">
          {site.site_name}
        </h3>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
          style={{ backgroundColor: sizeColor }}
        >
          {sizeHebrew[site.size_category] || site.size_category}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span dir="ltr">{site.state}</span>
        <span className="text-gray-300">|</span>
        <span dir="ltr">{site.site_type}</span>
      </div>

      <p className="text-xs text-gray-600 mb-2" dir="ltr">
        {site.managing_organization}
        {site.operator && site.operator !== site.managing_organization && (
          <span className="text-gray-400"> / {site.operator}</span>
        )}
      </p>

      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Radio className="w-3 h-3" /> {site.radar_count} מכ&quot;מים
        </span>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" /> {site.activity_count} פעילויות
        </span>
      </div>

      <Link
        href={`/site/${site.site_id}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        צפייה בפרופיל מלא <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}
