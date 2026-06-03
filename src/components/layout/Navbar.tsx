"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, ClipboardList, Crosshair } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/map", label: "תצוגת מפה", icon: Map },
    { href: "/management", label: "Management", icon: ClipboardList },
  ];

  return (
    <nav className="bg-slate-900 text-white h-16 flex items-center px-6 shadow-lg">
      <Link href="/map" className="flex items-center gap-2 ml-8">
        <Crosshair className="w-6 h-6 text-red-400" />
        <span className="text-lg font-bold">מפת מטווחי ניסוי וביטחון – ארה&quot;ב</span>
      </Link>

      <div className="flex items-center gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === href
                ? "bg-slate-700 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
