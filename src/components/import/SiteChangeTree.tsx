"use client";

/**
 * Per-site change tree for the redesigned import wizard.
 *
 * Each Site is a card. Each card has up to four sub-sections:
 *   - פרטי אתר      (when the site row itself has changes)
 *   - ראדרים        (modified or new radars under this site)
 *   - פעילויות אתר   (modified or new operational activities)
 *   - אנשי קשר      (modified or new contacts)
 *
 * The parent (site) checkbox is a tristate that mirrors / drives the
 * child checkboxes. Filter chips at the top hide whole entity types.
 * A search box matches site_name / site_id / entity ids.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, AlertTriangle, Plus, Pencil } from "lucide-react";
import type { ScanResult, SiteChangeNode, EntityChange } from "@/lib/excel-import";

type Filter = { sites: boolean; radars: boolean; activities: boolean; contacts: boolean };

interface Props {
  scan: ScanResult;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function SiteChangeTree({ scan, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ sites: true, radars: true, activities: true, contacts: true });
  const [expanded, setExpanded] = useState<Set<string>>(new Set(scan.sites.slice(0, 5).map((s) => s.siteId)));

  // Apply filter + search.
  const visibleNodes = useMemo<SiteChangeNode[]>(() => {
    const q = query.trim().toLowerCase();
    const out: SiteChangeNode[] = [];
    for (const node of scan.sites) {
      const filteredNode: SiteChangeNode = {
        ...node,
        siteChange: filter.sites ? node.siteChange : undefined,
        radars: filter.radars ? node.radars : [],
        activities: filter.activities ? node.activities : [],
        contacts: filter.contacts ? node.contacts : [],
      };
      const hasAny = (filteredNode.siteChange ? 1 : 0)
        + filteredNode.radars.length + filteredNode.activities.length + filteredNode.contacts.length > 0;
      if (!hasAny) continue;
      if (q) {
        const text = [
          node.siteId, node.siteName, node.country ?? "", node.state ?? "",
          ...filteredNode.radars.map((r) => `${r.entityId} ${r.displayName}`),
          ...filteredNode.activities.map((a) => `${a.entityId} ${a.displayName}`),
          ...filteredNode.contacts.map((c) => `${c.entityId} ${c.displayName}`),
        ].join(" ").toLowerCase();
        if (!text.includes(q)) continue;
      }
      out.push(filteredNode);
    }
    return out;
  }, [scan, query, filter]);

  const allKeysOfNode = (node: SiteChangeNode): string[] => {
    const keys: string[] = [];
    if (node.siteChange) keys.push(node.siteChange.selectionKey);
    for (const c of node.radars) keys.push(c.selectionKey);
    for (const c of node.activities) keys.push(c.selectionKey);
    for (const c of node.contacts) keys.push(c.selectionKey);
    return keys;
  };

  const toggleKey = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key); else next.delete(key);
    onChange(next);
  };

  const toggleNode = (node: SiteChangeNode, on: boolean) => {
    const keys = allKeysOfNode(node);
    const next = new Set(selected);
    if (on) keys.forEach((k) => next.add(k));
    else keys.forEach((k) => next.delete(k));
    onChange(next);
  };

  const selectVisibleAll = () => {
    const next = new Set(selected);
    for (const node of visibleNodes) for (const k of allKeysOfNode(node)) next.add(k);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  const totalVisibleKeys = visibleNodes.reduce((s, n) => s + allKeysOfNode(n).length, 0);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי אתר, מזהה, או שם רכיב..."
            className="w-full pr-8 pl-3 py-2 border border-gray-200 rounded-md text-sm"
            dir="rtl"
          />
        </div>
        <FilterChip label={`אתרים (${scan.totals.sites})`} on={filter.sites} onToggle={(v) => setFilter({ ...filter, sites: v })} />
        <FilterChip label={`ראדרים (${scan.totals.radars})`} on={filter.radars} onToggle={(v) => setFilter({ ...filter, radars: v })} />
        <FilterChip label={`פעילויות (${scan.totals.activities})`} on={filter.activities} onToggle={(v) => setFilter({ ...filter, activities: v })} />
        <FilterChip label={`אנשי קשר (${scan.totals.contacts})`} on={filter.contacts} onToggle={(v) => setFilter({ ...filter, contacts: v })} />
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-sm text-gray-600">
            נבחרו <strong className="text-blue-700">{selected.size}</strong> מתוך {totalVisibleKeys} מוצגים
          </span>
          <button
            type="button"
            onClick={selectVisibleAll}
            disabled={totalVisibleKeys === 0}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
          >
            בחר הכל המוצג
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.size === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md disabled:opacity-50"
          >
            נקה בחירה
          </button>
        </div>
      </div>

      {/* Scrollable card panel — keeps the toolbar above and the sticky
         action bar below always in view, no matter how many sites the
         scan turned up. min-height ensures the panel is usable on short
         viewports; max-height caps it to the leftover viewport space. */}
      {visibleNodes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500 text-sm">
          לא נמצאו שינויים — הקובץ אינו מכיל רשומות שונות מהמסד.
        </div>
      ) : (
        <div
          className="overflow-y-auto pl-1 pr-2 space-y-3 border border-gray-200 rounded-lg bg-gray-50/40 p-3"
          style={{ maxHeight: "calc(100vh - 360px)", minHeight: "320px" }}
        >
          {visibleNodes.map((node) => (
            <SiteCard
              key={node.siteId}
              node={node}
              selected={selected}
              expanded={expanded.has(node.siteId)}
              onToggleExpand={() => {
                const next = new Set(expanded);
                if (next.has(node.siteId)) next.delete(node.siteId); else next.add(node.siteId);
                setExpanded(next);
              }}
              onToggleKey={toggleKey}
              onToggleNode={toggleNode}
              allKeysOfNode={allKeysOfNode}
            />
          ))}
        </div>
      )}

      {/* Issues summary (non-fatal validation warnings) */}
      {scan.issues.filter((i) => i.severity === "warning").length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
          <strong>אזהרות ולידציה:</strong> {scan.issues.filter((i) => i.severity === "warning").length}.
          {" "}שדות מוגנים (latitude/longitude/site_name) ימשיכו כפי שהם — לא ייכתבו ללא דגל מתקדם.
        </div>
      )}
    </div>
  );
}


function FilterChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className={
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs cursor-pointer border " +
      (on ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-gray-100 border-gray-200 text-gray-500")
    }>
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-3 w-3" />
      {label}
    </label>
  );
}


function SiteCard({
  node, selected, expanded, onToggleExpand, onToggleKey, onToggleNode, allKeysOfNode,
}: {
  node: SiteChangeNode;
  selected: Set<string>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleKey: (k: string, on: boolean) => void;
  onToggleNode: (n: SiteChangeNode, on: boolean) => void;
  allKeysOfNode: (n: SiteChangeNode) => string[];
}) {
  const keys = allKeysOfNode(node);
  const selectedCount = keys.filter((k) => selected.has(k)).length;
  const totalCount = keys.length;
  const state: "all" | "some" | "none" = selectedCount === 0 ? "none" : selectedCount === totalCount ? "all" : "some";

  const borderColor =
    node.status === "new" ? "border-yellow-300"
    : node.status === "orphan" ? "border-red-300"
    : selectedCount > 0 ? "border-blue-300" : "border-gray-200";

  const statusBadge =
    node.status === "new" ? <Badge color="yellow">אתר חדש — ייווצר</Badge>
    : node.status === "orphan" ? <Badge color="red">site_id לא ידוע</Badge>
    : null;

  return (
    <article className={`bg-white border ${borderColor} rounded-lg overflow-hidden`}>
      {/* Card header */}
      <header className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50/50" onClick={onToggleExpand}>
        <Tristate
          state={state}
          onClick={(e) => { e.stopPropagation(); onToggleNode(node, state !== "all"); }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-500" dir="ltr">{node.siteId}</span>
            <span className="font-semibold text-gray-900 truncate" dir="ltr">{node.siteName}</span>
            {statusBadge}
            {node.country && (
              <span className="text-xs text-gray-500" dir="ltr">{node.country}{node.state ? ` / ${node.state}` : ""}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {node.siteChange ? "1 שינוי באתר · " : ""}
            {node.radars.length > 0 && `${node.radars.length} ראדרים · `}
            {node.activities.length > 0 && `${node.activities.length} פעילויות · `}
            {node.contacts.length > 0 && `${node.contacts.length} אנשי קשר · `}
            <span className="text-blue-700">{selectedCount}/{totalCount} נבחרו</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </header>

      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50/40">
          {node.siteChange && (
            <SubSection title="פרטי אתר">
              <EntityRow ch={node.siteChange} selected={selected.has(node.siteChange.selectionKey)} onToggle={(on) => onToggleKey(node.siteChange!.selectionKey, on)} />
            </SubSection>
          )}
          {node.radars.length > 0 && (
            <SubSection title={`ראדרים (${node.radars.length})`}>
              {node.radars.map((ch) => (
                <EntityRow key={ch.selectionKey} ch={ch} selected={selected.has(ch.selectionKey)} onToggle={(on) => onToggleKey(ch.selectionKey, on)} />
              ))}
            </SubSection>
          )}
          {node.activities.length > 0 && (
            <SubSection title={`פעילויות אתר (${node.activities.length})`}>
              {node.activities.map((ch) => (
                <EntityRow key={ch.selectionKey} ch={ch} selected={selected.has(ch.selectionKey)} onToggle={(on) => onToggleKey(ch.selectionKey, on)} />
              ))}
            </SubSection>
          )}
          {node.contacts.length > 0 && (
            <SubSection title={`אנשי קשר (${node.contacts.length})`}>
              {node.contacts.map((ch) => (
                <EntityRow key={ch.selectionKey} ch={ch} selected={selected.has(ch.selectionKey)} onToggle={(on) => onToggleKey(ch.selectionKey, on)} />
              ))}
            </SubSection>
          )}
          {node.status === "orphan" && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>הרשומות הללו מתייחסות ל־site_id שלא קיים במסד ולא מופיע בגיליון Sites של הקובץ. ניתן ליצור את האתר בנפרד דרך db:import לפני ייבוא הרשומות.</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-700 mb-1">{title}</h4>
      <div className="space-y-1">{children}</div>
    </section>
  );
}


function EntityRow({ ch, selected, onToggle }: { ch: EntityChange; selected: boolean; onToggle: (on: boolean) => void }) {
  const hasErrors = ch.errors.some((e) => e.severity === "error");
  const visibleFields = ch.fields.slice(0, 3);
  return (
    <div
      className={
        "flex items-start gap-2 p-2 rounded-md border " +
        (hasErrors ? "bg-red-50 border-red-200"
         : selected ? "bg-blue-50 border-blue-200"
         : "bg-white border-gray-200 hover:border-blue-200")
      }
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={hasErrors}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ch.action === "Create"
            ? <Badge color="green"><Plus className="w-3 h-3 inline-block ml-0.5" />חדש</Badge>
            : <Badge color="blue"><Pencil className="w-3 h-3 inline-block ml-0.5" />עדכון</Badge>}
          <span className="font-mono text-xs text-gray-600" dir="ltr">{ch.entityId || "(ID יוקצה)"}</span>
          <span className="text-sm text-gray-900 truncate" dir="ltr" title={ch.displayName}>{ch.displayName}</span>
        </div>
        {visibleFields.length > 0 && (
          <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
            {visibleFields.map((f) => (
              <li key={f.field}>
                <span className="font-mono text-gray-700">{f.field}</span>
                {f.isProtected && <span className="text-amber-600 text-[10px] mr-1">[מוגן]</span>}
                {f.isClear && <span className="text-orange-600 text-[10px] mr-1">[ניקוי]</span>}
                {": "}
                <span className="text-gray-500">{f.oldValue === null ? "(ריק)" : truncate(String(f.oldValue), 30)}</span>
                {" → "}
                <span className="text-gray-900">{f.newValue === null ? "(ריק)" : truncate(String(f.newValue), 30)}</span>
              </li>
            ))}
            {ch.fields.length > visibleFields.length && (
              <li className="text-gray-400 text-[10px]">…ועוד {ch.fields.length - visibleFields.length} שדות</li>
            )}
          </ul>
        )}
        {hasErrors && (
          <ul className="mt-1 text-xs text-red-700">
            {ch.errors.filter((e) => e.severity === "error").map((e, i) => <li key={i}>⚠ {e.message}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}


function Tristate({ state, onClick }: { state: "all" | "some" | "none"; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={state === "all" ? "true" : state === "none" ? "false" : "mixed"}
      role="checkbox"
      className={
        "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors " +
        (state === "all" ? "bg-blue-600 border-blue-600 text-white"
         : state === "some" ? "bg-blue-100 border-blue-600 text-blue-700"
         : "bg-white border-gray-300")
      }
    >
      {state === "all" ? "✓" : state === "some" ? "–" : ""}
    </button>
  );
}


function Badge({ color, children }: { color: "green" | "yellow" | "blue" | "red"; children: React.ReactNode }) {
  const colors = {
    green: "bg-green-100 text-green-800 border-green-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    red: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={"inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border " + colors[color]}>
      {children}
    </span>
  );
}


function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
