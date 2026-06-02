"use client";

import { Source } from "@/lib/types";

interface CitedTextProps {
  text: string;
  sources: Source[];
  className?: string;
  isEnglish?: boolean;
}

/**
 * Renders text with [SRC-NNNN] or [SRC-NNNN, SRC-NNNN] citations as
 * Wikipedia-style superscript links. Hover shows source title, click jumps
 * to the Sources section of the page.
 */
export default function CitedText({ text, sources, className = "", isEnglish }: CitedTextProps) {
  if (!text) return null;

  const sourceMap = new Map<string, Source>();
  for (const s of sources) sourceMap.set(s.source_id, s);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let citeIdx = 0;
  const pattern = /\[((?:SRC-\d+)(?:,\s*SRC-\d+)*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const ids = match[1].split(/,\s*/);
    const links: React.ReactNode[] = [];
    ids.forEach((id, i) => {
      const src = sourceMap.get(id);
      const title = src?.source_title || id;
      const url = src?.source_url;
      links.push(
        <sup key={`${citeIdx}-${i}`} className="ms-0.5">
          <a
            href={`#source-${id}`}
            title={title}
            className="text-blue-600 hover:text-blue-800 hover:underline px-0.5"
            onClick={(e) => {
              if (url) {
                e.preventDefault();
                window.open(url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            [{id.replace("SRC-", "")}]
          </a>
        </sup>
      );
      if (i < ids.length - 1) links.push(<sup key={`${citeIdx}-sep-${i}`}>,</sup>);
    });
    parts.push(<span key={`cite-${citeIdx}`}>{links}</span>);
    lastIndex = pattern.lastIndex;
    citeIdx++;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  const dir = isEnglish ? "ltr" : undefined;
  return (
    <span className={className} dir={dir}>
      {parts}
    </span>
  );
}
