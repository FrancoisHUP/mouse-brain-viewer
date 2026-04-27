import { useMemo, useState } from "react";

type MetadataRichContentProps = {
  value: string;
};

type MetadataEditorProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: "edit" | "preview" | "split";
  onModeChange?: (mode: "edit" | "preview" | "split") => void;
};

const ALLOWED_TAGS = new Set([
  "a",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "class",
  "colspan",
  "height",
  "href",
  "id",
  "loading",
  "rel",
  "rowspan",
  "src",
  "style",
  "target",
  "title",
  "width",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:image\/|mailto:|\/|#)/i.test(trimmed)) return trimmed;
  return "";
}

function renderInlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, alt, src, title) => {
    const safeSrc = sanitizeUrl(src);
    if (!safeSrc) return "";
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}"${safeTitle} loading="lazy">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, label, href, title) => {
    const safeHref = sanitizeUrl(href);
    if (!safeHref) return escapeHtml(label);
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safeHref)}"${safeTitle} target="_blank" rel="noreferrer">${label}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

function flushList(listItems: string[], ordered: boolean) {
  if (!listItems.length) return "";
  const tag = ordered ? "ol" : "ul";
  const items = listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("");
  listItems.length = 0;
  return `<${tag}>${items}</${tag}>`;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  const listItems: string[] = [];
  let listOrdered = false;
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    parts.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (codeLines) {
        parts.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        flushParagraph();
        parts.push(flushList(listItems, listOrdered));
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      parts.push(flushList(listItems, listOrdered));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      parts.push(flushList(listItems, listOrdered));
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = !!ordered;
      if (listItems.length && listOrdered !== nextOrdered) {
        parts.push(flushList(listItems, listOrdered));
      }
      listOrdered = nextOrdered;
      listItems.push((unordered?.[1] ?? ordered?.[1] ?? "").trim());
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      parts.push(flushList(listItems, listOrdered));
      parts.push(`<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    parts.push(flushList(listItems, listOrdered));
    paragraph.push(trimmed);
  }

  if (codeLines) {
    parts.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  parts.push(flushList(listItems, listOrdered));
  return parts.filter(Boolean).join("\n");
}

function looksLikeHtml(value: string) {
  const trimmed = value.trim();
  return /^<!doctype\s+html/i.test(trimmed) || /^<([a-z][\w:-]*)(\s|>|\/>)/i.test(trimmed);
}

function sanitizeHtml(html: string) {
  if (typeof document === "undefined") return "";
  const template = document.createElement("template");
  template.innerHTML = html;

  function walk(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) {
        if (tagName === "script" || tagName === "style" || tagName === "iframe") {
          element.remove();
          return;
        }
        const children = Array.from(element.childNodes);
        element.replaceWith(...children);
        for (const child of children) {
          walk(child);
        }
        return;
      }

      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || !ALLOWED_ATTRIBUTES.has(name)) {
          element.removeAttribute(attr.name);
          continue;
        }
        if ((name === "src" || name === "href") && !sanitizeUrl(attr.value)) {
          element.removeAttribute(attr.name);
        }
        if (name === "style" && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(attr.value)) {
          element.removeAttribute(attr.name);
        }
      }

      if (tagName === "a") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer");
      }
      if (tagName === "img" && !element.getAttribute("loading")) {
        element.setAttribute("loading", "lazy");
      }
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  }

  walk(template.content);
  return template.innerHTML;
}

export function MetadataRichContent({ value }: MetadataRichContentProps) {
  const rendered = useMemo(() => {
    const source = value.trim();
    if (!source) return "";
    return sanitizeHtml(looksLikeHtml(source) ? source : markdownToHtml(source));
  }, [value]);

  if (!rendered) {
    return (
      <div data-theme-text="muted" style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.74 }}>
        No metadata content.
      </div>
    );
  }

  return (
    <>
      <style>{`
        .metadata-rich-content {
          color: inherit;
          font-size: 13px;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        .metadata-rich-content h1,
        .metadata-rich-content h2,
        .metadata-rich-content h3 {
          margin: 0 0 10px;
          line-height: 1.18;
          letter-spacing: 0;
        }
        .metadata-rich-content h1 { font-size: 22px; }
        .metadata-rich-content h2 { font-size: 18px; }
        .metadata-rich-content h3 { font-size: 15px; }
        .metadata-rich-content p,
        .metadata-rich-content ul,
        .metadata-rich-content ol,
        .metadata-rich-content blockquote,
        .metadata-rich-content pre,
        .metadata-rich-content table,
        .metadata-rich-content figure {
          margin: 0 0 12px;
        }
        .metadata-rich-content ul,
        .metadata-rich-content ol {
          padding-left: 20px;
        }
        .metadata-rich-content img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        .metadata-rich-content a {
          color: #a7d6ff;
        }
        .metadata-rich-content code {
          border-radius: 5px;
          padding: 1px 5px;
          background: rgba(255,255,255,0.08);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.92em;
        }
        .metadata-rich-content pre {
          max-width: 100%;
          overflow: auto;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.24);
          padding: 10px;
        }
        .metadata-rich-content pre code {
          padding: 0;
          background: transparent;
        }
        .metadata-rich-content blockquote {
          border-left: 3px solid rgba(130,190,255,0.45);
          padding: 6px 0 6px 12px;
          color: rgba(255,255,255,0.78);
        }
        .metadata-rich-content table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .metadata-rich-content th,
        .metadata-rich-content td {
          border: 1px solid rgba(255,255,255,0.12);
          padding: 6px 8px;
          text-align: left;
        }
      `}</style>
      <div className="metadata-rich-content" dangerouslySetInnerHTML={{ __html: rendered }} />
    </>
  );
}

export function MetadataEditor({ value, onChange, mode, onModeChange }: MetadataEditorProps) {
  const [localTab, setLocalTab] = useState<"edit" | "preview" | "split">("edit");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const tab = mode ?? localTab;

  function setTab(next: "edit" | "preview" | "split") {
    if (mode === undefined) {
      setLocalTab(next);
    }
    onModeChange?.(next);
  }

  async function copyRawMetadata() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  }

  const copyButtonLabel =
    copyState === "copied" ? "Raw metadata copied" : copyState === "failed" ? "Copy raw metadata failed" : "Copy raw metadata";

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 10, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
        <div
          role="tablist"
          aria-label="Metadata editor mode"
          style={{
            display: "inline-flex",
            width: "fit-content",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            padding: 2,
          }}
        >
          {(["edit", "preview", "split"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tab === mode}
              onClick={() => setTab(mode)}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 6,
                border: "none",
                background: tab === mode ? "rgba(120,190,255,0.22)" : "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "capitalize",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void copyRawMetadata()}
          title={copyButtonLabel}
          aria-label={copyButtonLabel}
          style={{
            height: 32,
            width: 32,
            padding: 0,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            color: "inherit",
            cursor: "pointer",
            display: "inline-grid",
            placeItems: "center",
            flex: "0 0 auto",
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        </button>
      </div>

      {tab === "edit" ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 0,
            resize: "none",
            boxSizing: "border-box",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.22)",
            color: "inherit",
            padding: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.55,
            outline: "none",
          }}
        />
      ) : tab === "preview" ? (
        <div
          data-theme-surface="soft"
          style={{
            minHeight: 0,
            overflow: "auto",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            padding: 12,
          }}
        >
          <MetadataRichContent value={value} />
        </div>
      ) : (
        <div
          style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 10,
          }}
        >
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              resize: "none",
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.22)",
              color: "inherit",
              padding: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.55,
              outline: "none",
            }}
          />
          <div
            data-theme-surface="soft"
            style={{
              minHeight: 0,
              overflow: "auto",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.035)",
              padding: 12,
            }}
          >
            <MetadataRichContent value={value} />
          </div>
        </div>
      )}
    </div>
  );
}
