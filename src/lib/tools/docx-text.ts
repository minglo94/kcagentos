import JSZip from "jszip";
import { DOMParser, type Node as XmlNode } from "@xmldom/xmldom";

export const DOCX_INPUT_LIMIT = 10 * 1024 * 1024;
export const DOCX_XML_LIMIT = 16 * 1024 * 1024;
const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

export class DocxTextError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}

/** Read only the main document part; do not inflate attachments or follow relationships. */
export async function extractDocxText(input: Buffer): Promise<string> {
  if (input.length > DOCX_INPUT_LIMIT) throw new DocxTextError("DOCX 檔案過大（上限 10MB）", 413);
  try {
    const zip = await JSZip.loadAsync(input);
    const part = zip.file("word/document.xml");
    if (!part) throw new DocxTextError("DOCX 缺少主文件內容");
    const bytes = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      // JSZip documents this method but omits it from JSZipObject's public typings.
      const streamPart = part as JSZip.JSZipObject & {
        internalStream(type: "nodebuffer"): JSZip.JSZipStreamHelper<Buffer>;
      };
      const stream = streamPart.internalStream("nodebuffer");
      stream.on("data", (chunk: Buffer) => {
        if (settled) { stream.pause(); return; }
        size += chunk.length;
        if (size > DOCX_XML_LIMIT) {
          settled = true;
          stream.pause();
          reject(new DocxTextError("DOCX 解壓後內容過大（上限 16MB）", 413));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", (error: Error) => { if (!settled) { settled = true; reject(error); } });
      stream.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks, size)); } });
      stream.resume();
    });
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Never accept a DTD or custom entity declaration, including external resources.
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new DocxTextError("DOCX 包含不允許的 XML 宣告");
    const document = new DOMParser({ onError: () => { throw new Error("Invalid XML"); } }).parseFromString(xml, "application/xml");
    const root = document.documentElement;
    if (!root || root.localName !== "document" || !WORD_NAMESPACES.has(root.namespaceURI ?? "")) {
      throw new DocxTextError("DOCX 主文件格式不正確");
    }
    const output: string[] = [];
    // Iterative traversal also handles deeply nested documents without recursion overflow.
    const stack: { node: XmlNode; exiting: boolean }[] = [{ node: root, exiting: false }];
    while (stack.length) {
      const { node, exiting } = stack.pop()!;
      const element = node.nodeType === 1 ? node as typeof root : null;
      const isWord = element && WORD_NAMESPACES.has(element.namespaceURI ?? "");
      if (exiting) {
        if (isWord && (element.localName === "p" || element.localName === "tr")) output.push("\n");
        if (isWord && element.localName === "tc") output.push("\t");
        continue;
      }
      if (isWord && element.localName === "t") { output.push(element.textContent ?? ""); continue; }
      if (isWord && element.localName === "tab") output.push("\t");
      if (isWord && (element.localName === "br" || element.localName === "cr")) output.push("\n");
      stack.push({ node, exiting: true });
      for (let child = node.lastChild; child; child = child.previousSibling) stack.push({ node: child, exiting: false });
    }
    return output.join("").replace(/\n{3,}/g, "\n\n").trim();
  } catch (error) {
    if (error instanceof DocxTextError) throw error;
    throw new DocxTextError("DOCX 文件損壞或 XML 格式不正確");
  }
}
