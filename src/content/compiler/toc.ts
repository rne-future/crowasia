import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import type { TocEntry } from "./types";

export interface TocContext {
  toc: TocEntry[];
  headingsCount: number;
}

function getNodeText(node: Element): string {
  let text = "";
  visit(node, (child) => {
    if (child.type === "text" && "value" in child) {
      text += child.value;
    }
  });
  return text.trim();
}

export function slugifyHeading(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function rehypeToc(context: TocContext) {
  return (tree: Root) => {
    const usedIds = new Map<string, number>();

    visit(tree, "element", (node: Element) => {
      const match = node.tagName.match(/^h([1-6])$/);
      if (!match) return;

      // Skip auto-generated footnote label headings
      if (
        node.properties?.id === "footnote-label" ||
        (Array.isArray(node.properties?.className) &&
          node.properties.className.includes("sr-only"))
      ) {
        return;
      }

      context.headingsCount++;
      const level = parseInt(match[1], 10);
      const title = getNodeText(node);

      // Generate or retrieve slug id
      let id = (node.properties?.id as string) || slugifyHeading(title);
      if (!id) id = `heading-${context.headingsCount}`;

      // Handle duplicate ids
      const count = usedIds.get(id) || 0;
      usedIds.set(id, count + 1);
      if (count > 0) {
        id = `${id}-${count}`;
      }

      node.properties = {
        ...node.properties,
        id,
      };

      // Only h2 and h3 are included in TOC
      if (level === 2 || level === 3) {
        context.toc.push({
          id,
          title,
          level,
        });
      }
    });
  };
}
