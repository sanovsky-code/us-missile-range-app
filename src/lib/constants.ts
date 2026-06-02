export const SITE_TYPES = [
  "Range",
  "Base",
  "Launch Site",
  "Radar Site",
  "Tracking Station",
  "Test Facility",
  "Other",
] as const;

export const SIZE_CATEGORIES = [
  "Small",
  "Medium",
  "Large",
  "Strategic / Mega",
] as const;

export const RECORD_STATUSES = [
  "Draft",
  "Verified",
  "Needs Review",
  "Published",
  "Archived",
] as const;

export const CONFIDENCE_LEVELS = ["High", "Medium", "Low"] as const;

export const COORDINATE_TYPES = [
  "Site centroid",
  "Public entrance",
  "Admin office",
  "Public marker",
  "Unknown",
] as const;

export const RADAR_TYPES = [
  "Tracking",
  "Surveillance",
  "Fire-control",
  "Phased-array",
  "Telemetry",
  "Weather/range radar",
  "Unknown",
] as const;

export const OPERATIONAL_STATUSES = [
  "Active",
  "Inactive",
  "Historical",
  "Unknown",
] as const;

export const ACTIVITY_CATEGORIES = [
  "Missile Test",
  "Space Launch",
  "Radar Tracking",
  "Telemetry",
  "Missile Defense",
  "Range Safety",
  "Aerospace Test",
  "Other",
] as const;

export const ACTIVITY_STATUSES = [
  "Current",
  "Historical",
  "Planned",
  "Unknown",
] as const;

export const SOURCE_TYPES = [
  "Official",
  "Government",
  "Contractor",
  "News",
  "Academic",
  "Industry",
  "Other",
] as const;

export const CONTACT_TYPES = [
  "Public Affairs",
  "Media",
  "Visitor Office",
  "Contracting",
  "General Info",
  "Other",
] as const;

export const MAP_CENTER: [number, number] = [20, 10];
export const MAP_ZOOM = 2;
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";

export const SIZE_CATEGORY_COLORS: Record<string, string> = {
  Small: "#22c55e",
  Medium: "#3b82f6",
  Large: "#f97316",
  "Strategic / Mega": "#ef4444",
};

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "Marshall Islands",
];
