#!/usr/bin/env node
/**
 * CS Agent — Company Secretary / CA / Financial Analyst Bot
 *
 * Multi-user Telegram bot for Indian corporate law & finance.
 * Analyzes PDFs, images, financial statements.
 * Expert in Companies Act, SEBI, Income Tax, GST, FEMA, RBI.
 */
import "dotenv/config"
import TelegramBot from "node-telegram-bot-api"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import db from "./src/database.mjs"
import csBrain from "./src/cs-brain.mjs"
import docProcessor from "./src/doc-processor.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) { console.error("Set TELEGRAM_BOT_TOKEN"); process.exit(1) }

const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID) || 0
const DATA_DIR = path.resolve(__dirname, "data")
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const bot = new TelegramBot(BOT_TOKEN, { polling: true })
const MAX_MSG = 4096

// ── Prepared Statements ─────────────────────────────────────
const stmts = {
  upsertUser: db.prepare(`INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_active=datetime('now'), queries_count=queries_count+1`),
  getUser: db.prepare(`SELECT * FROM users WHERE telegram_id = ?`),
  saveQuery: db.prepare(`INSERT INTO queries (telegram_id, query_type, query, response, tokens_used, cost_usd) VALUES (?, ?, ?, ?, ?, ?)`),
  saveDoc: db.prepare(`INSERT INTO documents (telegram_id, file_name, file_type, summary, extracted_text) VALUES (?, ?, ?, ?, ?)`),
  getUserStats: db.prepare(`SELECT COUNT(*) as queries, COALESCE(SUM(cost_usd),0) as cost FROM queries WHERE telegram_id = ?`),
  getGlobalStats: db.prepare(`SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM queries) as queries, (SELECT COALESCE(SUM(cost_usd),0) FROM queries) as cost`),
}

// ── Commands ────────────────────────────────────────────────
bot.setMyCommands([
  { command: "start", description: "Welcome & help" },
  { command: "ask", description: "Ask any CS/CA/legal question" },
  { command: "deadlines", description: "Upcoming compliance deadlines" },
  { command: "checklist", description: "Compliance checklist for a topic" },
  { command: "section", description: "Look up a law section" },
  { command: "compare", description: "Compare old vs new law provisions" },
  { command: "penalty", description: "Check penalties for non-compliance" },
  { command: "gst", description: "GST related queries" },
  { command: "tax", description: "Income tax queries" },
  { command: "roc", description: "ROC filing help" },
  { command: "sebi", description: "SEBI regulation queries" },
  { command: "mystats", description: "Your usage stats" },
  { command: "help", description: "All commands" },
])

// ── Helpers ─────────────────────────────────────────────────
function splitMsg(text) {
  if (text.length <= MAX_MSG) return [text]
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MSG) { chunks.push(remaining); break }
    let idx = remaining.lastIndexOf("\n", MAX_MSG)
    if (idx < MAX_MSG * 0.3) idx = MAX_MSG
    chunks.push(remaining.slice(0, idx))
    remaining = remaining.slice(idx)
  }
  return chunks
}

async function safeSend(chatId, text, opts = {}) {
  try {
    const chunks = splitMsg(text)
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown", ...opts })
    }
  } catch {
    const chunks = splitMsg(text.replace(/[*_`\[\]\\]/g, ""))
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk).catch(() => {})
    }
  }
}

function registerUser(msg) {
  stmts.upsertUser.run(msg.from.id, msg.from.username || "", msg.from.first_name || "")
}

// ── /start ──────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  registerUser(msg)
  const name = msg.from.first_name || "there"
  safeSend(msg.chat.id,
    `Namaste ${name}! 🙏\n\n` +
      `I'm your *Company Secretary & Financial Expert* — ask me anything about Indian corporate law, taxation, compliance, or finance.\n\n` +
      `*What I can do:*\n` +
      `📋 Answer CS/CA/legal questions with section references\n` +
      `📄 Analyze PDFs — send me any document\n` +
      `🖼️ Read images — board resolutions, notices, forms\n` +
      `📊 Financial analysis — ratios, red flags, comparisons\n` +
      `⏰ Compliance deadlines — never miss a filing\n` +
      `💰 Tax planning — ITR, GST, TDS queries\n\n` +
      `*Quick commands:*\n` +
      `/deadlines — Upcoming due dates\n` +
      `/section 149 — Look up Companies Act section\n` +
      `/gst <query> — GST help\n` +
      `/tax <query> — Income Tax help\n` +
      `/roc <query> — ROC filing help\n` +
      `/penalty <topic> — Check penalties\n\n` +
      `Or just *send me your question directly!* 💬\n` +
      `You can also *send PDFs or images* for analysis 📎`,
  )
})

// ── /help ───────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  safeSend(msg.chat.id,
    `*All Commands:*\n\n` +
      `💬 Just type any question — I'll answer with law references\n` +
      `📄 Send a PDF — I'll analyze and summarize\n` +
      `🖼️ Send an image — I'll read and extract info\n\n` +
      `/ask <question> — Ask anything\n` +
      `/section <number> — Companies Act section lookup\n` +
      `/deadlines — Upcoming compliance dates\n` +
      `/checklist <topic> — Step-by-step compliance checklist\n` +
      `/compare <topic> — Old vs new law comparison\n` +
      `/penalty <topic> — Penalties for non-compliance\n` +
      `/gst <query> — GST queries\n` +
      `/tax <query> — Income Tax queries\n` +
      `/roc <query> — ROC filing queries\n` +
      `/sebi <query> — SEBI regulation queries\n` +
      `/mystats — Your usage\n`,
  )
})

// ── /deadlines ──────────────────────────────────────────────
bot.onText(/\/deadlines/, (msg) => {
  registerUser(msg)
  const deadlines = csBrain.getUpcomingDeadlines()
  const lines = deadlines.map((d) =>
    `📅 *${d.date}* — ${d.task}\n   _${d.law}_`,
  )
  safeSend(msg.chat.id,
    `⏰ *Upcoming Compliance Deadlines*\n\n${lines.join("\n\n")}\n\n_Always verify on MCA/SEBI/IT portal_`,
  )
})

// ── /section <number> ───────────────────────────────────────
bot.onText(/\/section\s+(.+)/, async (msg, match) => {
  registerUser(msg)
  const chatId = msg.chat.id
  const section = match[1].trim()
  const loading = await bot.sendMessage(chatId, `📖 _Looking up Section ${section}..._`, { parse_mode: "Markdown" })

  try {
    const { text, usage } = await csBrain.askExpert(
      `Explain Section ${section} of the Companies Act 2013 in detail. Include: what it says, key rules under it, practical implications, penalties for non-compliance, related sections, and any recent amendments. If this section number doesn't exist in Companies Act, check Income Tax Act, GST Act, or SEBI regulations.`,
    )
    stmts.saveQuery.run(msg.from.id, "section_lookup", `Section ${section}`, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)
  } catch (err) {
    bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── /checklist <topic> ──────────────────────────────────────
bot.onText(/\/checklist\s+(.+)/, async (msg, match) => {
  registerUser(msg)
  const chatId = msg.chat.id
  const topic = match[1].trim()
  const loading = await bot.sendMessage(chatId, `📋 _Preparing checklist for "${topic}"..._`, { parse_mode: "Markdown" })

  try {
    const { text, usage } = await csBrain.askExpert(
      `Give me a complete step-by-step compliance checklist for: "${topic}" in India. Include forms to file, due dates, documents needed, fees, penalties for delay, and practical tips. Format as a numbered checklist.`,
    )
    stmts.saveQuery.run(msg.from.id, "checklist", topic, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)
  } catch (err) {
    bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── /penalty <topic> ────────────────────────────────────────
bot.onText(/\/penalty\s+(.+)/, async (msg, match) => {
  registerUser(msg)
  const chatId = msg.chat.id
  const topic = match[1].trim()
  const loading = await bot.sendMessage(chatId, `⚠️ _Checking penalties for "${topic}"..._`, { parse_mode: "Markdown" })

  try {
    const { text, usage } = await csBrain.askExpert(
      `What are the penalties for non-compliance with "${topic}" under Indian law? Include: penalty amount (Rs.), who is liable (company/officer/director), daily default charges, imprisonment provisions, compounding options, and relevant section numbers.`,
    )
    stmts.saveQuery.run(msg.from.id, "penalty", topic, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)
  } catch (err) {
    bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── /compare <topic> ────────────────────────────────────────
bot.onText(/\/compare\s+(.+)/, async (msg, match) => {
  registerUser(msg)
  const chatId = msg.chat.id
  const topic = match[1].trim()
  const loading = await bot.sendMessage(chatId, `📊 _Comparing provisions for "${topic}"..._`, { parse_mode: "Markdown" })

  try {
    const { text, usage } = await csBrain.askExpert(
      `Compare the old and new provisions for "${topic}" in Indian law. Show a table with: Old provision (Companies Act 1956 / old rule) vs New provision (Companies Act 2013 / current rule). Include section numbers, key changes, and practical impact.`,
    )
    stmts.saveQuery.run(msg.from.id, "compare", topic, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)
  } catch (err) {
    bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── /gst, /tax, /roc, /sebi — Domain queries ───────────────
for (const [cmd, domain, label] of [
  ["gst", "GST (Goods and Services Tax)", "GST"],
  ["tax", "Income Tax", "Tax"],
  ["roc", "ROC filing and MCA compliance", "ROC"],
  ["sebi", "SEBI regulations and securities law", "SEBI"],
]) {
  bot.onText(new RegExp(`\\/${cmd}\\s+(.+)`), async (msg, match) => {
    registerUser(msg)
    const chatId = msg.chat.id
    const query = match[1].trim()
    const loading = await bot.sendMessage(chatId, `🔍 _Looking into ${label}: "${query}"..._`, { parse_mode: "Markdown" })

    try {
      const { text, usage } = await csBrain.askExpert(
        `Answer this ${domain} question: "${query}". Be specific with section numbers, rules, rates, and due dates.`,
      )
      stmts.saveQuery.run(msg.from.id, cmd, query, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
      bot.deleteMessage(chatId, loading.message_id).catch(() => {})
      safeSend(chatId, text)
    } catch (err) {
      bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
    }
  })
}

// ── /ask — Explicit question ────────────────────────────────
bot.onText(/\/ask\s+(.+)/s, async (msg, match) => {
  registerUser(msg)
  const chatId = msg.chat.id
  const query = match[1].trim()
  const category = csBrain.categorizeQuery(query)
  const loading = await bot.sendMessage(chatId, `🧠 _Thinking..._`, { parse_mode: "Markdown" })

  try {
    const { text, usage } = await csBrain.askExpert(query)
    stmts.saveQuery.run(msg.from.id, category, query, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)
  } catch (err) {
    bot.editMessageText(`Error: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── /mystats ────────────────────────────────────────────────
bot.onText(/\/mystats/, (msg) => {
  const stats = stmts.getUserStats.get(msg.from.id)
  safeSend(msg.chat.id,
    `📊 *Your Stats*\n\n` +
      `Queries: ${stats?.queries || 0}\n` +
      `Cost: $${(stats?.cost || 0).toFixed(4)}\n`,
  )
})

// ── PDF Document Handler ────────────────────────────────────
bot.on("document", async (msg) => {
  if (!msg.document) return
  registerUser(msg)
  const chatId = msg.chat.id
  const doc = msg.document
  const fileName = doc.file_name || "document"
  const isPDF = fileName.toLowerCase().endsWith(".pdf")

  if (!isPDF) {
    bot.sendMessage(chatId, "Send me a PDF file and I'll analyze it! 📄")
    return
  }

  const loading = await bot.sendMessage(chatId, `📄 _Analyzing "${fileName}"..._`, { parse_mode: "Markdown" })

  try {
    const file = await bot.getFile(doc.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
    const response = await fetch(fileUrl)
    const buffer = Buffer.from(await response.arrayBuffer())

    const filePath = path.join(DATA_DIR, `${Date.now()}-${fileName}`)
    fs.writeFileSync(filePath, buffer)

    const extracted = await docProcessor.extractPDF(filePath)
    const docType = docProcessor.detectDocType(extracted.text)

    const { text, usage } = await csBrain.askExpert(
      `Analyze this ${docType} document. Provide: 1) Summary 2) Key entities (dates, amounts, parties, CIN/DIN) 3) Compliance requirements 4) Any red flags or issues 5) Action items`,
      { documentText: extracted.text },
    )

    stmts.saveDoc.run(msg.from.id, fileName, docType, text.slice(0, 2000), extracted.text.slice(0, 10000))
    stmts.saveQuery.run(msg.from.id, "document_analysis", `PDF: ${fileName}`, text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)

    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, `📄 *Document Analysis: ${fileName}*\n_Type: ${docType} | Pages: ${extracted.pages}_\n\n${text}`)

    fs.unlinkSync(filePath)
  } catch (err) {
    bot.editMessageText(`PDF analysis failed: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── Image Handler (OCR + Analysis) ──────────────────────────
bot.on("photo", async (msg) => {
  if (!msg.photo?.length) return
  registerUser(msg)
  const chatId = msg.chat.id
  const caption = msg.caption || "Analyze this document image. Extract all text, identify the document type, and explain its legal/compliance significance."

  const loading = await bot.sendMessage(chatId, `🖼️ _Reading image..._`, { parse_mode: "Markdown" })

  try {
    const photo = msg.photo[msg.photo.length - 1]
    const file = await bot.getFile(photo.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
    const response = await fetch(fileUrl)
    const buffer = Buffer.from(await response.arrayBuffer())

    const filePath = path.join(DATA_DIR, `img-${Date.now()}.jpg`)
    fs.writeFileSync(filePath, buffer)

    const { base64, mediaType } = docProcessor.imageToBase64(filePath)
    const { text, usage } = await csBrain.askExpert(caption, { imageBase64: base64, imageMediaType: mediaType })

    stmts.saveQuery.run(msg.from.id, "image_analysis", caption.slice(0, 200), text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)

    bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    safeSend(chatId, text)

    fs.unlinkSync(filePath)
  } catch (err) {
    bot.editMessageText(`Image analysis failed: ${err.message}`, { chat_id: chatId, message_id: loading.message_id })
  }
})

// ── General Message Handler ─────────────────────────────────
bot.on("message", async (msg) => {
  if (msg.text?.startsWith("/")) return
  if (msg.document || msg.photo) return
  if (!msg.text) return

  registerUser(msg)
  const chatId = msg.chat.id
  const query = msg.text.trim()
  if (query.length < 3) return

  const category = csBrain.categorizeQuery(query)
  bot.sendChatAction(chatId, "typing")

  try {
    const { text, usage } = await csBrain.askExpert(query)
    stmts.saveQuery.run(msg.from.id, category, query.slice(0, 500), text.slice(0, 5000), usage.inputTokens + usage.outputTokens, usage.cost)
    safeSend(chatId, text)
  } catch (err) {
    if (err.message.includes("API_KEY")) {
      bot.sendMessage(chatId, "I'm not configured yet. Admin needs to set the ANTHROPIC_API_KEY.")
    } else {
      bot.sendMessage(chatId, `Something went wrong: ${err.message.slice(0, 100)}`)
    }
  }
})

// ── Graceful Shutdown ───────────────────────────────────────
process.on("SIGINT", () => { bot.stopPolling(); process.exit(0) })
process.on("uncaughtException", (err) => console.error("Uncaught:", err.message))
process.on("unhandledRejection", (reason) => {
  const msg = String(reason)
  if (!msg.includes("parse entities")) console.error("Unhandled:", msg)
})

console.log("🏛️ CS Agent started — Company Secretary / CA / Financial Analyst")
console.log(`   Bot: @${(await bot.getMe()).username}`)
