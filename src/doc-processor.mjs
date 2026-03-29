/**
 * Document Processor — PDF, images, financial statements
 */
import fs from "fs"
import path from "path"

/**
 * Extract text from PDF
 */
export async function extractPDF(filePath) {
  const pdfParse = (await import("pdf-parse")).default
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return {
    text: data.text,
    pages: data.numpages,
    info: data.info,
  }
}

/**
 * Convert image to base64 for Claude vision
 */
export function imageToBase64(filePath) {
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mediaType = ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".webp" ? "image/webp" : "image/jpeg"
  return { base64: buffer.toString("base64"), mediaType }
}

/**
 * Detect document type from text content
 */
export function detectDocType(text) {
  const t = text.toLowerCase()
  if (t.includes("balance sheet") || t.includes("profit and loss") || t.includes("cash flow")) return "financial_statement"
  if (t.includes("board resolution") || t.includes("resolved that")) return "board_resolution"
  if (t.includes("memorandum of association") || t.includes("articles of association")) return "moa_aoa"
  if (t.includes("certificate of incorporation")) return "incorporation_cert"
  if (t.includes("form mgt") || t.includes("form aoc") || t.includes("form dir")) return "roc_form"
  if (t.includes("invoice") || t.includes("gstin")) return "invoice"
  if (t.includes("agreement") || t.includes("contract")) return "agreement"
  if (t.includes("notice") && t.includes("meeting")) return "meeting_notice"
  if (t.includes("audit report") || t.includes("auditor")) return "audit_report"
  if (t.includes("show cause") || t.includes("penalty")) return "regulatory_notice"
  return "general"
}

export default { extractPDF, imageToBase64, detectDocType }
