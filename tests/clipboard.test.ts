import { describe, expect, it } from "vitest";
import { htmlToRows, looksLikeTable, parseTSV } from "@/lib/clipboard";

describe("parseTSV", () => {
  it("splits rows and cells", () => {
    expect(parseTSV("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("handles CRLF and trailing newline", () => {
    expect(parseTSV("a\tb\r\nc\td\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("looksLikeTable", () => {
  it("rejects plain words", () => {
    expect(looksLikeTable("hello world")).toBe(false);
  });
  it("accepts tab-separated content", () => {
    expect(looksLikeTable("a\tb\nc\td")).toBe(true);
  });
});

describe("htmlToRows", () => {
  it("extracts cells from <table>", () => {
    const html = "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>";
    expect(htmlToRows(html)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
  it("returns null when no table", () => {
    expect(htmlToRows("<p>nope</p>")).toBeNull();
  });
});
