import { Contact } from "@/lib/types";
import { Users, Mail, Phone, Globe } from "lucide-react";

export default function ContactsSection({ contacts }: { contacts: Contact[] }) {
  if (!contacts || contacts.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">אנשי קשר</h2>
        <p className="text-sm text-gray-500">אין מידע ציבורי ליצירת קשר.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-purple-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          אנשי קשר ציבוריים ({contacts.length})
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {contacts.map((contact) => (
          <div
            key={contact.contact_id}
            className="border border-gray-100 rounded-lg p-4"
          >
            <p className="font-medium text-gray-900 text-sm">{contact.organization_name}</p>
            <p className="text-xs text-gray-500 mb-2">{contact.contact_type}</p>
            <div className="space-y-1">
              {contact.contact_email && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Mail className="w-3 h-3" />
                  <a href={`mailto:${contact.contact_email}`} className="text-blue-600 hover:text-blue-800" dir="ltr">
                    {contact.contact_email}
                  </a>
                </div>
              )}
              {contact.contact_phone && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Phone className="w-3 h-3" />
                  <span dir="ltr">{contact.contact_phone}</span>
                </div>
              )}
              {contact.contact_url && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Globe className="w-3 h-3" />
                  <a href={contact.contact_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 truncate" dir="ltr">
                    {contact.contact_url}
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
