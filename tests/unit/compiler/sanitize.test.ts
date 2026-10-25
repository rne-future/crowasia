import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeSvg } from "@/content/compiler/sanitize";

describe("sanitizeHtml", () => {
  it("strips <script> tags", () => {
    const dirty = '<p>Safe paragraph</p><script>alert("xss")</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("<p>Safe paragraph</p>");
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain('alert("xss")');
  });

  it("strips event handlers (onclick, onerror, onload)", () => {
    const dirty =
      '<div onclick="steal()">click me</div><img src="x" onerror="alert(1)">';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("steal()");
  });

  it("strips <iframe>", () => {
    const dirty = '<iframe src="https://evil.com"></iframe>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("evil.com");
  });

  it("strips javascript: URLs", () => {
    const dirty = '<a href="javascript:alert(1)">Click here</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("Click here");
  });

  it("strips data: URLs in href/src", () => {
    const dirty =
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Payload</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("data:");
  });

  it("strips <style> tags", () => {
    const dirty = "<style>body { display: none; }</style><p>Content</p>";
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("<style>");
    expect(clean).not.toContain("display: none");
    expect(clean).toContain("<p>Content</p>");
  });

  it("allows safe tags from allowlist", () => {
    const safeInput = [
      "<p>Text</p>",
      "<h1>H1</h1>",
      "<h2>H2</h2>",
      "<h3>H3</h3>",
      "<h4>H4</h4>",
      "<h5>H5</h5>",
      "<h6>H6</h6>",
      "<ul><li>List item</li></ul>",
      "<ol><li>Ordered item</li></ol>",
      "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>",
      "<blockquote>Quote</blockquote>",
      "<code>const x = 1;</code>",
      "<pre><code>block</code></pre>",
      '<a href="https://example.com">Link</a>',
      "<em>Emphasis</em>",
      "<strong>Strong</strong>",
      "<del>Deleted</del>",
      "<hr>",
      "<br>",
      "<details><summary>Summary</summary><p>Details body</p></details>",
      "<mark>Marked</mark>",
      '<abbr title="Abbreviation">ABBR</abbr>',
      "<ins>Inserted</ins>",
      "<kbd>Ctrl+K</kbd>",
      '<aside class="alert-note">Aside note</aside>',
      "<span>Span</span>",
      '<div class="checklist">Div container</div>',
    ].join("\n");

    const clean = sanitizeHtml(safeInput);
    expect(clean).toContain("<p>Text</p>");
    expect(clean).toContain("<h1>H1</h1>");
    expect(clean).toContain("<h2>H2</h2>");
    expect(clean).toContain("<h3>H3</h3>");
    expect(clean).toContain("<table>");
    expect(clean).toContain("<details>");
    expect(clean).toContain("<summary>Summary</summary>");
    expect(clean).toContain("<mark>Marked</mark>");
    expect(clean).toContain('<abbr title="Abbreviation">ABBR</abbr>');
    expect(clean).toContain("<kbd>Ctrl+K</kbd>");
    expect(clean).toContain('<aside class="alert-note">Aside note</aside>');
  });

  it("strips arbitrary class names not from registry", () => {
    const dirty =
      '<aside class="alert-note malicious-class-xyz random_bad_class">Aside</aside><p class="arbitrary-class">Text</p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("alert-note");
    expect(clean).not.toContain("malicious-class-xyz");
    expect(clean).not.toContain("random_bad_class");
    expect(clean).not.toContain('class="arbitrary-class"');
  });
});

describe("sanitizeSvg", () => {
  it("strips foreignObject", () => {
    const dirtySvg =
      '<svg><foreignObject width="100" height="50"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject><circle cx="5" cy="5" r="5"/></svg>';
    const clean = sanitizeSvg(dirtySvg);
    expect(clean).not.toContain("<foreignObject");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert(1)");
    expect(clean).toContain("<circle");
  });

  it("strips script elements in SVG", () => {
    const dirtySvg =
      '<svg><script>alert("svg xss")</script><rect width="10" height="10"/></svg>';
    const clean = sanitizeSvg(dirtySvg);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("svg xss");
    expect(clean).toContain("<rect");
  });

  it("strips event attributes in SVG", () => {
    const dirtySvg =
      '<svg><rect width="10" height="10" onclick="alert(1)" onload="alert(2)"/></svg>';
    const clean = sanitizeSvg(dirtySvg);
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("alert");
    expect(clean).toContain("<rect");
  });

  it("strips external links/resources in SVG", () => {
    const dirtySvg =
      '<svg><a href="javascript:alert(1)"><text>Click</text></a><image href="data:image/svg+xml,..."><set/></image></svg>';
    const clean = sanitizeSvg(dirtySvg);
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("data:");
  });
});
