interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

const colorMap: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-800",
  yellow: "bg-yellow-100 text-yellow-800",
  purple: "bg-purple-100 text-purple-800",
};

export default function Badge({ children, color = "gray", className = "" }: BadgeProps) {
  const colorClass = colorMap[color] || colorMap.gray;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}>
      {children}
    </span>
  );
}

export function SizeBadge({ sizeCategory }: { sizeCategory: string }) {
  const colorMap: Record<string, string> = {
    Small: "green",
    Medium: "blue",
    Large: "orange",
    "Strategic / Mega": "red",
  };
  return <Badge color={colorMap[sizeCategory] || "gray"}>{sizeCategory}</Badge>;
}

export function ConfidenceBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    High: "green",
    Medium: "yellow",
    Low: "red",
  };
  return <Badge color={colorMap[level] || "gray"}>{level}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    Current: "green",
    Historical: "gray",
    Planned: "blue",
    Active: "green",
    Inactive: "gray",
    Published: "green",
    Draft: "yellow",
    Verified: "blue",
    "Needs Review": "orange",
    Archived: "gray",
    Unknown: "gray",
  };
  return <Badge color={colorMap[status] || "gray"}>{status}</Badge>;
}
