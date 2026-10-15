import { describe, expect, it } from "vitest";
import { renderInline, renderMarkdown, stripMarkdown } from "../markdown";

describe("renderInline", () => {
  it("escapes raw HTML", () => {
    expect(renderInline('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("renders bold, italic, and code", () => {
    expect(renderInline("**bold** and *italic* and `code`")).toBe(
      "<strong>bold</strong> and <em>italic</em> and <code>code</code>",
    );
  });

  it("does not format inside code spans", () => {
    expect(renderInline("`**no**`")).toBe("<code>**no**</code>");
  });

  it("links markdown links and bare URLs", () => {
    expect(renderInline("[notes](https://example.com/a?b=1&c=2)")).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">notes</a>',
    );
    expect(renderInline("see https://example.com/x.")).toBe(
      'see <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>.',
    );
  });

  it("drops unsafe link targets", () => {
    expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });
});

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, and lists", () => {
    const html = renderMarkdown("### Changed\n\n- one\n- two\n\nplain *text*");
    expect(html).toContain("<h3>Changed</h3>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<p>plain <em>text</em></p>");
  });

  it("renders tables cell by cell", () => {
    const html = renderMarkdown("| Platform | File |\n|----------|------|\n| macOS | `a.dmg` |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Platform</th>");
    expect(html).toContain("<td><code>a.dmg</code></td>");
  });

  it("renders fenced code without formatting", () => {
    const html = renderMarkdown("```\n**x** <b>y</b>\n```");
    expect(html).toBe("<pre><code>**x** &lt;b&gt;y&lt;/b&gt;</code></pre>");
  });

  it("never passes through raw HTML blocks", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("stripMarkdown", () => {
  it("returns plain text for the settings preview", () => {
    expect(
      stripMarkdown("### Changed\n\n- Rename `x` to **y**, see [docs](https://example.com)\n"),
    ).toBe("Changed Rename x to y, see docs");
  });
});
