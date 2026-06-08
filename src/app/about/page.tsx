import Link from "next/link";
import { Mail, Phone, User, Rocket, MapPin } from "lucide-react";

export const metadata = { title: "אודות" };

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Rocket className="w-5 h-5 text-red-400" />
            <span className="text-sm">מפת מטווחי ניסוי טילים</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">אודות</h1>
        </header>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">פיתוח ותחזוקה</h2>
          <dl className="space-y-3">
            <ContactRow icon={<User className="w-4 h-4" />} label="שם">
              Oren Sanovsky
            </ContactRow>
            <ContactRow icon={<Mail className="w-4 h-4" />} label="דוא&quot;ל">
              <a
                href="mailto:sanovsky@gmail.com"
                className="text-blue-700 hover:text-blue-900 hover:underline"
                dir="ltr"
              >
                sanovsky@gmail.com
              </a>
            </ContactRow>
            <ContactRow icon={<Phone className="w-4 h-4" />} label="טלפון">
              <a
                href="tel:+972544242529"
                className="text-blue-700 hover:text-blue-900 hover:underline"
                dir="ltr"
              >
                +972-54-4242529
              </a>
            </ContactRow>
          </dl>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">על האפליקציה</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            אפליקציית מפה אינטראקטיבית להצגת מטווחי ניסוי טילים, אתרי שיגור, מכ&quot;מים ומתקני
            הגנה אוויסטרטגיים. הנתונים נשמרים ב־SQLite מקומי, ניתנים לעדכון מבוקר מתוך קבצי
            אקסל, ומלווים ב־Activity Timeline בסגנון Salesforce לכל אתר.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/map"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-medium"
            >
              <MapPin className="w-3.5 h-3.5" />
              חזרה למפה
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}


function ContactRow({
  icon, label, children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <dt className="flex items-center gap-2 text-gray-500 text-sm w-24 flex-shrink-0">
        {icon}
        {label}
      </dt>
      <dd className="text-gray-900 text-sm">{children}</dd>
    </div>
  );
}
