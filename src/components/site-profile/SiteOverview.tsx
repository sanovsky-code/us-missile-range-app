import { Site } from "@/lib/types";
import { Building2, Globe, Mail, Phone, Crosshair } from "lucide-react";
import CitedText from "@/components/ui/CitedText";

export default function SiteOverview({ site }: { site: Site }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">סקירה כללית</h2>
      <div className="mb-6">
        <CitedText
          text={site.description}
          sources={site.sources || []}
          as="div"
          className="text-gray-700 leading-relaxed text-left whitespace-pre-wrap"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">גוף מנהל</p>
            <p className="text-sm font-medium text-gray-800" dir="ltr" style={{ textAlign: "left" }}>{site.managing_organization}</p>
          </div>
        </div>
        {site.operator && (
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">מפעיל</p>
              <p className="text-sm font-medium text-gray-800" dir="ltr" style={{ textAlign: "left" }}>{site.operator}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Crosshair className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">קואורדינטות</p>
            <p className="text-sm font-medium text-gray-800" dir="ltr" style={{ textAlign: "left" }}>
              {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
            </p>
            <p className="text-xs text-gray-400">{site.coordinate_type}</p>
          </div>
        </div>
        {site.website && (
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">אתר אינטרנט</p>
              <a
                href={site.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 block"
                dir="ltr"
                style={{ textAlign: "left" }}
              >
                {new URL(site.website).hostname}
              </a>
            </div>
          </div>
        )}
        {site.public_contact_email && (
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">דוא&quot;ל ליצירת קשר</p>
              <p className="text-sm font-medium text-gray-800" dir="ltr" style={{ textAlign: "left" }}>{site.public_contact_email}</p>
            </div>
          </div>
        )}
        {site.public_contact_phone && (
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">טלפון</p>
              <p className="text-sm font-medium text-gray-800" dir="ltr" style={{ textAlign: "left" }}>{site.public_contact_phone}</p>
            </div>
          </div>
        )}
      </div>

      {(site.missile_relevance || site.launch_relevance || site.radar_relevance) && (
        <div className="mt-6 space-y-3 border-t border-gray-100 pt-4">
          {site.missile_relevance && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">רלוונטיות טילית</p>
              <p className="text-sm text-gray-700 mt-1 leading-relaxed text-left" dir="ltr">{site.missile_relevance}</p>
            </div>
          )}
          {site.launch_relevance && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">רלוונטיות שיגור</p>
              <p className="text-sm text-gray-700 mt-1 leading-relaxed text-left" dir="ltr">{site.launch_relevance}</p>
            </div>
          )}
          {site.radar_relevance && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">רלוונטיות מכ&quot;מ</p>
              <p className="text-sm text-gray-700 mt-1 leading-relaxed text-left" dir="ltr">{site.radar_relevance}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
