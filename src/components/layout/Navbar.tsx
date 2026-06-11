"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, ClipboardList, Rocket, Upload, Star, Info, Users, Globe, Briefcase } from "lucide-react";
import NavbarUserChip from "@/components/identity/NavbarUserChip";

export default function Navbar() {
  const pathname = usePathname();

  // Note on RTL ordering: the navbar parent is rendered inside an RTL
  // document, so flex children flow right-to-left. The first item in
  // `links` appears nearest the title (visually right); the LAST item
  // appears at the visually leftmost edge. "אודות" therefore goes last.
  const links = [
    { href: "/map", label: "תצוגת מפה", icon: Map },
    { href: "/favorites", label: "מועדפים", icon: Star },
    { href: "/contacts", label: "אנשי קשר", icon: Users },
    { href: "/opportunities", label: "הזדמנויות", icon: Briefcase },
    { href: "/management", label: "Management", icon: ClipboardList },
    { href: "/import", label: "ייבוא נתונים", icon: Upload },
    { href: "/countries", label: "מדינות", icon: Globe },
    { href: "/about", label: "אודות", icon: Info },
  ];

  return (
    <nav className="bg-slate-900 text-white h-16 flex items-center px-6 shadow-lg">
      {/* Brand. To use a custom photo instead of this icon, drop the file
          at /public/logo.png and replace the <Rocket /> below with
          <Image src="/logo.png" alt="" width={28} height={28} /> from
          next/image. */}
      <Link href="/map" className="flex items-center gap-2 ml-8">
        <Rocket className="w-6 h-6 text-red-400" />
        <span className="text-lg font-bold">מפת מטווחי ניסוי טילים</span>
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

      <NavbarUserChip />
    </nav>
  );
}
