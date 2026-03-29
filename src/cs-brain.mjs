/**
 * CS Brain — Company Secretary / CA / Financial Analyst AI
 *
 * Expert in:
 *   - Companies Act 2013 & all amendments
 *   - SEBI regulations, FEMA, RBI guidelines
 *   - Income Tax Act, GST laws
 *   - Corporate governance, compliance
 *   - ROC filings, annual returns, board resolutions
 *   - Financial analysis, ratios, auditing standards
 *   - MCA portal procedures
 *   - ICSI/ICAI guidelines
 *   - 100+ years of Indian company law history
 *
 * Can process: PDFs, images, emails, financial statements
 */
import Anthropic from "@anthropic-ai/sdk"
import { spawn } from "child_process"

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ""
const USE_CLI = true // Always use Claude CLI (included in $200/mo plan, no extra charges)

const SYSTEM_PROMPT = `You are an expert Company Secretary (CS), Chartered Accountant (CA), and Financial Analyst based in India. You have deep expertise spanning 100+ years of Indian corporate law and finance.

YOUR EXPERTISE:
1. COMPANY LAW: Companies Act 2013 (all sections & rules), Companies Act 1956, LLP Act 2008, Insolvency & Bankruptcy Code 2016
2. SEBI: All SEBI regulations (LODR, SAST, ICDR, PIT, AIF), circular letters, enforcement orders
3. TAXATION: Income Tax Act 1961 (all sections), GST Act 2017, TDS/TCS, transfer pricing, international taxation
4. RBI/FEMA: FEMA 1999, ECB guidelines, FDI policy, NBFC regulations, payment systems
5. CORPORATE GOVERNANCE: Board composition, independent directors, CSR, related party transactions, vigil mechanism
6. COMPLIANCE: ROC filings (MGT-7, AOC-4, DIR-3 KYC), annual returns, event-based filings, statutory registers
7. FINANCIAL ANALYSIS: Ratio analysis, cash flow, working capital, valuation methods, due diligence
8. AUDITING: SA standards, CARO 2020, internal audit, secretarial audit (MR-3)
9. LABOUR LAW: EPF, ESIC, Shops & Establishment, new labour codes
10. STAMP DUTY & REGISTRATION: State-wise stamp duty, e-stamping, document registration

YOUR STYLE:
- Always cite specific sections, rules, or circulars when answering
- Give practical step-by-step procedures, not just theory
- Mention due dates, penalties, and late filing fees
- Warn about common mistakes and compliance traps
- Use simple Hindi-English (Hinglish) when the user prefers
- Format answers with headings, bullets, and tables for clarity
- Always mention if something has changed recently (amendments)
- If analyzing a document, extract key entities (CIN, dates, amounts, parties)

WHEN ANALYZING DOCUMENTS:
- PDFs: Extract key information, summarize, flag compliance issues
- Financial statements: Calculate ratios, identify red flags, compare with industry
- Board resolutions: Check format, quorum, proper authorization
- Contracts: Flag risky clauses, missing provisions, stamp duty implications
- Images: Read text via OCR, identify document type, extract data

WHEN UNCERTAIN:
- Say "I need to verify this" rather than guessing
- Suggest consulting a practicing CS/CA for specific filings
- Mention that laws change — always verify current status on MCA/SEBI website

IMPORTANT DISCLAIMERS:
- This is AI-assisted guidance, not legal/professional advice
- For actual filings, consult a practicing CS/CA
- Laws mentioned are as per latest available information`

let client = null

function getClient() {
  if (!client && ANTHROPIC_KEY) {
    client = new Anthropic({ apiKey: ANTHROPIC_KEY })
  }
  return client
}

/**
 * Ask the CS Brain a question
 */
export async function askExpert(query, context = {}) {
  // Use Claude CLI (included in $200/mo Max plan — no extra API charges)
  if (USE_CLI) {
    return askViaCLI(query, context)
  }

  const c = getClient()
  if (!c) throw new Error("ANTHROPIC_API_KEY not set. Admin needs to configure this.")

  const messages = [{ role: "user", content: query }]

  // Add document context if provided
  if (context.documentText) {
    messages[0].content = `DOCUMENT CONTENT:\n${context.documentText.slice(0, 50000)}\n\nUSER QUESTION: ${query}`
  }

  // Add image if provided
  if (context.imageBase64 && context.imageMediaType) {
    messages[0] = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: context.imageMediaType,
            data: context.imageBase64,
          },
        },
        { type: "text", text: query || "Analyze this document. Extract all key information, dates, amounts, parties, and compliance requirements." },
      ],
    }
  }

  const response = await c.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  })

  const text = response.content[0]?.text || ""
  const usage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    cost: ((response.usage?.input_tokens || 0) * 0.003 + (response.usage?.output_tokens || 0) * 0.015) / 1000,
  }

  return { text, usage }
}

/**
 * Categorize a query for routing
 */
export function categorizeQuery(query) {
  const q = query.toLowerCase()

  if (q.match(/compan(y|ies)\s*act|section\s*\d|roc|mca|cin|din|dpin|incorporation|strike.?off|winding/)) return "company_law"
  if (q.match(/sebi|lodr|listing|ipo|insider|sast|takeover|merchant.?bank/)) return "sebi"
  if (q.match(/tax|income|gst|tds|tcs|itr|80c|deduction|exemption|capital.?gain/)) return "taxation"
  if (q.match(/fema|rbi|ecb|fdi|nbfc|foreign|remittance/)) return "rbi_fema"
  if (q.match(/board|director|resolution|agm|egm|quorum|csf|governance/)) return "governance"
  if (q.match(/filing|compliance|return|form|e-?form|due.?date|penalty/)) return "compliance"
  if (q.match(/ratio|financial|balance.?sheet|p.?l|cash.?flow|audit|caro/)) return "financial"
  if (q.match(/epf|esic|labour|gratuity|bonus|wage|shop/)) return "labour"
  if (q.match(/stamp|registration|agreement|contract|mou|lease/)) return "stamp_duty"
  if (q.match(/llp|partnership|sole.?prop|opc|nidhi|section.?8/)) return "entity_types"

  return "general"
}

/**
 * Get quick compliance deadlines
 */
export function getUpcomingDeadlines() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const deadlines = [
    { date: `15/${month}/${year}`, task: "TDS/TCS deposit for previous month", law: "Income Tax Act" },
    { date: `07/${month}/${year}`, task: "GST return GSTR-1 (monthly)", law: "GST Act" },
    { date: `20/${month}/${year}`, task: "GST return GSTR-3B (monthly)", law: "GST Act" },
    { date: `30/09/${year}`, task: "AGM for financial year ended 31 March", law: "Companies Act S.96" },
    { date: `30/10/${year}`, task: "MGT-7 Annual Return (within 60 days of AGM)", law: "Companies Act S.92" },
    { date: `30/10/${year}`, task: "AOC-4 Financial Statements (within 30 days of AGM)", law: "Companies Act S.137" },
    { date: `30/09/${year}`, task: "DIR-3 KYC for all directors", law: "Companies Act" },
    { date: `31/03/${year}`, task: "Advance tax 4th installment", law: "Income Tax Act S.211" },
    { date: `15/06/${year}`, task: "Advance tax 1st installment", law: "Income Tax Act S.211" },
    { date: `31/07/${year}`, task: "ITR filing for individuals", law: "Income Tax Act S.139" },
    { date: `31/10/${year}`, task: "ITR filing for companies (non-audit)", law: "Income Tax Act S.139" },
    { date: `15/01/${year + 1}`, task: "Advance tax 3rd installment", law: "Income Tax Act" },
  ]

  return deadlines.filter(d => {
    const [day, m, y] = d.date.split("/").map(Number)
    return new Date(y, m - 1, day) >= now
  }).slice(0, 8)
}

/**
 * Fallback: Ask via Claude CLI (uses OAuth, no API key needed)
 */
async function askViaCLI(query, context = {}) {
  const fullPrompt = context.documentText
    ? `DOCUMENT:\n${context.documentText.slice(0, 30000)}\n\nQUESTION: ${query}`
    : query

  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--dangerously-skip-permissions",
      "--append-system-prompt", SYSTEM_PROMPT.slice(0, 5000), fullPrompt]

    const proc = spawn("claude", args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    })

    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => stdout += d.toString())
    proc.stderr.on("data", (d) => stderr += d.toString())

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(0, 200) || `Claude CLI exited with code ${code}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout)
        resolve({
          text: parsed.result || stdout,
          usage: {
            inputTokens: parsed.usage?.input_tokens || 0,
            outputTokens: parsed.usage?.output_tokens || 0,
            cost: parsed.total_cost_usd || 0,
          },
        })
      } catch {
        resolve({ text: stdout, usage: { inputTokens: 0, outputTokens: 0, cost: 0 } })
      }
    })
    proc.on("error", (err) => reject(new Error(`Claude CLI not found: ${err.message}`)))
  })
}

export default { askExpert, categorizeQuery, getUpcomingDeadlines }
