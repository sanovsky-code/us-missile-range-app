"use client";

import { Source } from "@/lib/types";

interface CitedTextProps {
  text: string;
  sources: Source[];
  className?: string;
  isEnglish?: boolean;
  as?: "span" | "div";
}

function detectEnglish(text: string): boolean {
  if (!text) return false;
  const latin = text.match(/[A-Za-z]/g)?.length || 0;
  const hebrew = text.match(/[֐-׿]/g)?.length || 0;
  return latin > hebrew * 2;
}

/**
 * Renders text with [SRC-NNNN] or [SRC-NNNN, SRC-NNNN] citations as
 * Wikipedia-style superscript links. Hover shows source title, click opens URL.
 * Auto-detects English text and applies dir="ltr" + text-align:left so English
 * content reads naturally even inside an RTL parent context.
 */
export default function CitedText({ text, sources, className = "", isEnglish, as }: CitedTextProps) {
  if (!text) return null;

  const english = isEnglish ?? detectEnglish(text);

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
    // Dedupe consecutive same-source references like [1, 1]
    const uniqueIds = [...new Set(ids)];
    const links: React.ReactNode[] = [];
    uniqueIds.forEach((id, i) => {
      const src = sourceMap.get(id);
      const title = src?.source_title || id;
      links.push(
        <sup key={`${citeIdx}-${i}`} className="mx-0.5">
          <a
            href={`/source/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={title}
            className="text-blue-600 hover:text-blue-800 hover:underline px-0.5 no-underline"
          >
            [{id.replace("SRC-", "")}]
          </a>
        </sup>
      );
      if (i < uniqueIds.length - 1) links.push(<sup key={`${citeIdx}-sep-${i}`}>,</sup>);
    });
    parts.push(<span key={`cite-${citeIdx}`}>{links}</span>);
    lastIndex = pattern.lastIndex;
    citeIdx++;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  const Tag = (as ?? (english ? "div" : "span")) as "div" | "span";
  const dirProp = english ? "ltr" : undefined;
  const alignClass = english ? "text-left" : "";

  return (
    <Tag className={`${alignClass} ${className}`.trim()} dir={dirProp}>
      {parts}
    </Tag>
  );
}
