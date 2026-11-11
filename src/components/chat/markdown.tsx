import { Fragment, type ReactNode } from "react";

/*
 * The subset of Markdown agents write: fenced code, headings, lists, quotes,
 * tables, rules, and inline code, bold, italic and links. It builds React
 * nodes and never injects HTML, so transcript text cannot become markup.
 */

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)<>]+)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    const key = `${keyPrefix}-${index}`;
    index += 1;
    const [token, code, bold, boldAlt, italic, link, href, url] = match;
    if (code) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-surface-raised px-1 py-px font-mono text-[0.85em] text-ink"
        >
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold || boldAlt) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {inline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (italic) {
      nodes.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>);
    } else if (link && href) {
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--series-1)] underline decoration-[var(--series-1)]/40 hover:decoration-[var(--series-1)]"
        >
          {link.slice(1, link.indexOf("]"))}
        </a>,
      );
    } else if (url) {
      nodes.push(
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="break-all text-[var(--series-1)] underline decoration-[var(--series-1)]/40"
        >
          {url}
        </a>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

type Block =
  | { type: "code"; lang: string; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "rule" }
  | { type: "paragraph"; text: string };

const TABLE_DIVIDER = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = /^\s*(```|~~~)\s*(\S*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !lines[index].trim().startsWith(fence[1])
      ) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (line.includes("|") && TABLE_DIVIDER.test(lines[index + 1] ?? "")) {
      const rows = [cells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n") });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const next = LIST_ITEM.exec(lines[index]);
        if (next) {
          items.push(next[2]);
        } else if (/^\s{2,}\S/.test(lines[index]) && items.length > 0) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[index]) &&
      !LIST_ITEM.test(lines[index])
    ) {
      body.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: body.join("\n") });
  }
  return blocks;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, index, all) => {
    const nodes = inline(line, `${key}-${index}`);
    return index < all.length - 1
      ? [
          ...nodes,
          // biome-ignore lint/suspicious/noArrayIndexKey: line breaks never reorder
          <br key={`${key}-br-${index}`} />,
        ]
      : nodes;
  });
}

const HEADING_CLASS = [
  "text-[15px] font-semibold",
  "text-sm font-semibold",
  "text-[13px] font-semibold",
];

export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid min-w-0 gap-2 text-[13px] leading-relaxed text-ink-secondary">
      {parseBlocks(text).map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "code":
            return (
              <pre
                key={key}
                className="max-h-[420px] overflow-auto rounded-md bg-page p-2.5 font-mono text-[11.5px] leading-relaxed text-ink ring-1 ring-hairline"
              >
                {block.text}
              </pre>
            );
          case "heading":
            return (
              <p
                key={key}
                className={`${HEADING_CLASS[Math.min(block.level, 3) - 1]} mt-1 text-ink`}
              >
                {inline(block.text, key)}
              </p>
            );
          case "rule":
            return <hr key={key} className="border-hairline" />;
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-axis pl-3 text-muted"
              >
                {withBreaks(block.text, key)}
              </blockquote>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={key}
                className={`grid gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-muted`}
              >
                {block.items.map((entry, itemIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items never reorder
                  <li key={itemIndex}>
                    {inline(entry, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={key} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr
                        // biome-ignore lint/suspicious/noArrayIndexKey: table rows never reorder
                        key={rowIndex}
                        className={
                          rowIndex === 0
                            ? "border-b border-axis font-medium text-ink"
                            : "border-b border-hairline"
                        }
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            // biome-ignore lint/suspicious/noArrayIndexKey: cells never reorder
                            key={cellIndex}
                            className="px-2 py-1 align-top"
                          >
                            {inline(cell, `${key}-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "paragraph":
            return (
              <p key={key} className="break-words">
                {withBreaks(block.text, key)}
              </p>
            );
          default:
            return <Fragment key={key} />;
        }
      })}
    </div>
  );
}
