import { describe, expect, it } from "vitest";
import {
  autoDetectColumnMapping,
  parseCSV,
  recordsFromMappedRows,
  SAMPLE_CAMPAIGNS,
} from "../lib/campaign/parser";

describe("Campaign CSV Parser & Column Mapper", () => {
  it("parses comma-separated values correctly including quotes", () => {
    const csv = `ISBN,Title,Author,Price\n9786161234567,"The Book, Vol. 1",John Doe,295\n9786167890123,Simple Life,Jane Smith,350`;
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["ISBN", "Title", "Author", "Price"]);
    expect(rows.length).toBe(2);
    expect(rows[0][1]).toBe("The Book, Vol. 1");
    expect(rows[0][3]).toBe("295");
    expect(rows[1][1]).toBe("Simple Life");
  });

  it("handles tab-separated and semicolon-separated values", () => {
    const tsv = `Title\tAuthor\tPrice\nBook A\tAuthor A\t100`;
    const { headers, rows } = parseCSV(tsv);
    expect(headers).toEqual(["Title", "Author", "Price"]);
    expect(rows[0]).toEqual(["Book A", "Author A", "100"]);
  });

  it("auto-detects Thai column names with heuristics", () => {
    const thaiHeaders = [
      "รหัสสินค้า",
      "ชื่อหนังสือ",
      "ผู้แต่ง",
      "ราคาปกติ",
      "ราคาพิเศษ",
      "ส่วนลด",
      "รูปปก",
      "คำนิยม",
    ];
    const mapping = autoDetectColumnMapping(thaiHeaders);
    expect(mapping.isbn).toBe("รหัสสินค้า");
    expect(mapping.title).toBe("ชื่อหนังสือ");
    expect(mapping.author).toBe("ผู้แต่ง");
    expect(mapping.listPrice).toBe("ราคาปกติ");
    expect(mapping.salePrice).toBe("ราคาพิเศษ");
    expect(mapping.discountText).toBe("ส่วนลด");
    expect(mapping.coverUrl).toBe("รูปปก");
    expect(mapping.reviewerQuote).toBe("คำนิยม");
  });

  it("maps rows into structured BookCampaignRecord objects", () => {
    const csv = SAMPLE_CAMPAIGNS[0].csv;
    const { headers, rows } = parseCSV(csv);
    const mapping = autoDetectColumnMapping(headers);
    const records = recordsFromMappedRows(headers, rows, mapping);

    expect(records.length).toBe(3);
    expect(records[0].isbn).toBe("9786161852011");
    expect(records[0].title).toBe("กาลครั้งหนึ่ง...ถึงเธอที่คิดถึง");
    expect(records[0].author).toBe("คิดมาก");
    expect(records[0].listPrice).toBe("295");
    expect(records[0].salePrice).toBe("249");
    expect(records[0].discountText).toBe("ลด 15%");
  });
});
