import { visit } from "unist-util-visit";
import type { Root, Blockquote, Paragraph, Text } from "mdast";

export const ALERT_TYPES = [
  "NOTE",
  "TIP",
  "IMPORTANT",
  "WARNING",
  "CAUTION",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

const ALERT_REGEX =
  /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\r\n]*))?(?:\r?\n|$)/i;

export interface AlertTransformContext {
  alertsCount: number;
}

export function remarkAlerts(context?: AlertTransformContext) {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      if (!node.children || node.children.length === 0) return;
      const firstChild = node.children[0];
      if (
        firstChild.type !== "paragraph" ||
        !firstChild.children ||
        firstChild.children.length === 0
      ) {
        return;
      }
      const firstText = firstChild.children[0];
      if (firstText.type !== "text") return;

      const match = firstText.value.match(ALERT_REGEX);
      if (!match) return;

      if (context) {
        context.alertsCount++;
      }

      const rawType = match[1].toUpperCase() as AlertType;
      const type = rawType.toLowerCase();
      const customTitle = match[2]?.trim();
      const title =
        customTitle || type.charAt(0).toUpperCase() + type.slice(1);

      firstText.value = firstText.value.slice(match[0].length);

      const titleNode: Paragraph = {
        type: "paragraph",
        data: {
          hName: "p",
          hProperties: { className: ["alert-title"] },
        },
        children: [
          {
            type: "strong",
            children: [{ type: "text", value: title } as Text],
          },
        ],
      };

      if (firstText.value.trim() === "") {
        firstChild.children.shift();
      }

      if (firstChild.children.length === 0) {
        node.children[0] = titleNode;
      } else {
        node.children.unshift(titleNode);
      }

      node.data = {
        ...node.data,
        hName: "aside",
        hProperties: {
          className: [`alert-${type}`, "alert"],
          role: "region",
          "aria-label": title,
        },
      };
    });
  };
}
