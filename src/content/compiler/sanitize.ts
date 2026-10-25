import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

export const ALLOWED_CLASS_PATTERNS = [
  /^alert(-[a-z0-9_-]+)?$/,
  /^checklist(-[a-z0-9_-]+)?$/,
  /^mermaid(-[a-z0-9_-]+)?$/,
  /^language-[a-z0-9_-]+$/,
  /^footnote(-[a-z0-9_-]+)?$/,
  /^data-footnote-backref$/,
  /^footnotes$/,
  /^sr-only$/,
  /^script(-[a-z0-9_-]+)?$/,
];

export const HTML_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "blockquote",
    "code",
    "pre",
    "a",
    "em",
    "strong",
    "del",
    "hr",
    "br",
    "details",
    "summary",
    "mark",
    "abbr",
    "ins",
    "kbd",
    "aside",
    "span",
    "div",
    "sup",
    "sub",
    "section",
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
  ],
  attributes: {
    "*": ["id"],
    a: [
      "href",
      ["className", ...ALLOWED_CLASS_PATTERNS],
      "dataFootnoteRef",
      "dataFootnoteBackref",
      "ariaDescribedBy",
      "ariaLabel",
    ],
    abbr: ["title"],
    aside: [["className", ...ALLOWED_CLASS_PATTERNS]],
    div: [["className", ...ALLOWED_CLASS_PATTERNS], "dataScriptId"],
    ul: [["className", ...ALLOWED_CLASS_PATTERNS]],
    ol: [["className", ...ALLOWED_CLASS_PATTERNS], "start"],
    li: [
      ["className", ...ALLOWED_CLASS_PATTERNS],
      "dataOrdinal",
      "dataChecked",
    ],
    code: [["className", ...ALLOWED_CLASS_PATTERNS]],
    pre: [["className", ...ALLOWED_CLASS_PATTERNS]],
    span: [["className", ...ALLOWED_CLASS_PATTERNS]],
    section: ["dataFootnotes", ["className", ...ALLOWED_CLASS_PATTERNS]],
    sup: [["className", ...ALLOWED_CLASS_PATTERNS]],
    sub: [["className", ...ALLOWED_CLASS_PATTERNS]],
    details: ["open"],
    table: [],
    th: ["colSpan", "rowSpan", "align"],
    td: ["colSpan", "rowSpan", "align"],
    svg: ["viewBox", "width", "height", "xmlns", "version"],
    g: ["fill", "stroke", "transform"],
    path: ["d", "fill", "stroke", "strokeWidth", "transform"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke"],
    circle: ["cx", "cy", "r", "fill", "stroke"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth"],
    polyline: ["points", "fill", "stroke"],
    polygon: ["points", "fill", "stroke"],
    text: [
      "x",
      "y",
      "dx",
      "dy",
      "textAnchor",
      "fontSize",
      "fontFamily",
      "fontWeight",
      "fill",
    ],
    tspan: ["x", "y", "dx", "dy", "fill"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
  },
  strip: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "link",
    "meta",
    "applet",
    "foreignObject",
  ],
  clobberPrefix: "",
};

export const SVG_SANITIZE_SCHEMA: SanitizeSchema = {
  tagNames: [
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "defs",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "stop",
    "marker",
    "use",
    "symbol",
    "desc",
    "title",
  ],
  attributes: {
    "*": [
      "id",
      ["className", ...ALLOWED_CLASS_PATTERNS],
      "fill",
      "stroke",
      "strokeWidth",
      "transform",
      "opacity",
    ],
    svg: ["viewBox", "width", "height", "xmlns", "version"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    circle: ["cx", "cy", "r"],
    line: ["x1", "y1", "x2", "y2"],
    polyline: ["points"],
    polygon: ["points"],
    path: ["d"],
    text: [
      "x",
      "y",
      "dx",
      "dy",
      "textAnchor",
      "fontSize",
      "fontFamily",
      "fontWeight",
    ],
    tspan: ["x", "y", "dx", "dy"],
    use: ["href"],
  },
  protocols: {
    href: ["#"],
  },
  strip: ["script", "foreignObject", "style", "image", "animate", "set"],
  clobberPrefix: "",
};

const htmlSanitizerProcessor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, HTML_SANITIZE_SCHEMA)
  .use(rehypeStringify);

const svgSanitizerProcessor = unified()
  .use(rehypeParse, { fragment: true, space: "svg" })
  .use(rehypeSanitize, SVG_SANITIZE_SCHEMA)
  .use(rehypeStringify);

export function sanitizeHtml(html: string): string {
  return String(htmlSanitizerProcessor.processSync(html));
}

export function sanitizeSvg(svg: string): string {
  return String(svgSanitizerProcessor.processSync(svg));
}
