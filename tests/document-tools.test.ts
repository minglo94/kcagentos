import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { extractDocxText, DOCX_INPUT_LIMIT, DOCX_XML_LIMIT } from "../src/lib/tools/docx-text";
import { generateAttendanceXlsx, generateFad8Xlsx } from "../src/lib/tools/notice-xlsx";

const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const documentXml = (body: string) => `<w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
async function archive(xml: string) {
  return new JSZip().file("word/document.xml", xml).generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("DOCX plain text preserves paragraphs, tabs, line breaks and escaped text", async () => {
  const input = await archive(documentXml('<w:p><w:r><w:t>供應商 &amp; A</w:t><w:tab/><w:t>$80</w:t><w:br/><w:t>保養一年</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p>'));
  assert.equal(await extractDocxText(input), "供應商 & A\t$80\n保養一年\n第二段");
});

test("DOCX extraction rejects malformed XML, custom entities and invalid archive", async () => {
  for (const xml of [documentXml('<w:p><w:t>broken</w:p>'), '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]>' + documentXml('<w:p><w:t>&x;</w:t></w:p>'), documentXml('<w:p><w:t>&unknown;</w:t></w:p>'), '<other/>']) {
    await assert.rejects(extractDocxText(await archive(xml)), /DOCX/);
  }
  await assert.rejects(extractDocxText(Buffer.from("not a zip")), /DOCX/);
  const empty = await new JSZip().generateAsync({ type: "nodebuffer" });
  await assert.rejects(extractDocxText(empty), /缺少主文件/);
});

test("DOCX enforces compressed input and streamed uncompressed limits", async () => {
  await assert.rejects(extractDocxText(Buffer.alloc(DOCX_INPUT_LIMIT + 1)), /10MB/);
  const bomb = await archive(documentXml(`<w:p><w:t>${"x".repeat(DOCX_XML_LIMIT)}</w:t></w:p>`));
  assert.ok(bomb.length < DOCX_INPUT_LIMIT);
  await assert.rejects(extractDocxText(bomb), /16MB/);
});

test("existing attendance and FAD8 workbooks roundtrip with patched dependencies", async () => {
  const data = { activityName: "合成測試活動", issueDate: "2026-10-12", teacher: "測試老師", tutorType: "", tutorOrg: "", sessions: [{ date: "2026-10-13", startTime: "14:00", endTime: "15:00", location: "合成場地" }], students: [{ classCode: "1A", studentId: "01", name: "合成學生" }], fad8Cat: "1", dept: "ICT" };
  for (const generate of [generateAttendanceXlsx, generateFad8Xlsx]) {
    const output = await generate(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const cells: string[] = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value)))));
    assert.ok(cells.some((value) => value.includes("合成測試活動")));
    assert.ok(cells.includes("合成學生"));
    assert.ok(cells.includes("1A"));
  }
});
