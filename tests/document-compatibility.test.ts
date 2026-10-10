import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { createZipArchive } from "../src/lib/tools/archive";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth") as typeof import("mammoth");
const ExcelJS = require("exceljs") as typeof import("exceljs");
test("synthetic DOCX survives generation, extraction and ZIP packaging", async () => {
  const text = "合成班務摘要 Synthetic class summary";
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] }));
  const result = await mammoth.extractRawText({ buffer });
  assert.equal(result.value.trim(), text);
  const archive = createZipArchive(), chunks: Buffer[] = [];
  const ended = new Promise<Buffer>((resolve, reject) => { archive.on("data", chunk => chunks.push(Buffer.from(chunk))); archive.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject); });
  archive.append(buffer, { name: "synthetic-summary.docx" });
  await archive.finalize();
  const zip = await ended;
  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
  assert.ok(zip.includes(Buffer.from("synthetic-summary.docx")));
});
test("synthetic spreadsheet survives write/read with preserved values", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Synthetic");
  sheet.addRow(["Class", "Count"]); sheet.addRow(["Synthetic A", 3]);
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(bytes);
  assert.equal(restored.worksheets[0].getCell("A2").value, "Synthetic A");
  assert.equal(restored.worksheets[0].getCell("B2").value, 3);
});
