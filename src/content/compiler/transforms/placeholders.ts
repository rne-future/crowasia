import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";

export const PLACEHOLDER_MAX_LENGTH = 80;

// Matches [Placeholder] up to 80 characters without nested brackets or markdown links
const PLACEHOLDER_REGEX = /\[([A-Za-z0-9_\s-]{1,80})\]/g;

export function remarkPlaceholders() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text) => {
      if (!node.value.includes("[")) return;

      // Ensure that placeholders up to 80 characters are preserved safely as text
      // Any placeholder matching the pattern is already a text node in MDAST
      // Validate length constraint if needed
      node.value = node.value.replace(
        PLACEHOLDER_REGEX,
        (match, inner: string) => {
          if (inner.length > PLACEHOLDER_MAX_LENGTH) {
            return match;
          }
          return `[${inner}]`;
        }
      );
    });
  };
}
