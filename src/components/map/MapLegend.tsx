import { SIZE_CATEGORY_COLORS } from "@/lib/constants";

const hebrewLabels: Record<string, string> = {
  Small: "קטן",
  Medium: "בינוני",
  Large: "גדול",
  "Strategic / Mega": "אסטרטגי / מגה",
};

export default function MapLegend() {
  return (
    <div className="absolute bottom-6 right-6 z-[1000] bg-white rounded-lg shadow-lg p-3" dir="rtl">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">גודל האתר</h4>
      <div className="space-y-1">
        {Object.entries(SIZE_CATEGORY_COLORS).map(([category, color]) => (
          <div key={category} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-[11px] text-gray-600">{hebrewLabels[category] || category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
