/**
 * CS Agent Database — SQLite for users, queries, documents, knowledge
 * Data is PERMANENT — never deleted.
 */
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_DIR = process.env.DB_DIR || path.resolve(__dirname, "../data")
const DB_PATH = path.join(DB_DIR, "cs-agent.db")

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id    INTEGER PRIMARY KEY,
    username       TEXT,
    first_name     TEXT,
    company_name   TEXT,
    cin            TEXT,
    role           TEXT DEFAULT 'user',
    queries_count  INTEGER DEFAULT 0,
    joined_at      TEXT DEFAULT (datetime('now')),
    last_active    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS queries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER REFERENCES users(telegram_id),
    query_type     TEXT,
    query          TEXT,
    response       TEXT,
    sources        TEXT,
    tokens_used    INTEGER DEFAULT 0,
    cost_usd       REAL DEFAULT 0,
    rating         INTEGER,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER REFERENCES users(telegram_id),
    file_name      TEXT,
    file_type      TEXT,
    summary        TEXT,
    extracted_text TEXT,
    entities       TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_base (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category       TEXT,
    subcategory    TEXT,
    title          TEXT,
    content        TEXT,
    source         TEXT,
    law_section    TEXT,
    effective_date TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mistakes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER,
    query          TEXT,
    wrong_answer   TEXT,
    correction     TEXT,
    category       TEXT,
    lesson         TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    template_type  TEXT,
    template_name  TEXT,
    template_text  TEXT,
    variables      TEXT,
    category       TEXT,
    usage_count    INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER,
    doc_type       TEXT,
    original_text  TEXT,
    review_notes   TEXT,
    issues_found   INTEGER DEFAULT 0,
    risk_level     TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_companies (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER,
    company_name   TEXT,
    cin            TEXT,
    incorporation_date TEXT,
    company_type   TEXT,
    authorized_capital TEXT,
    paid_up_capital TEXT,
    registered_office TEXT,
    directors      TEXT,
    auditor        TEXT,
    notes          TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compliance_tracker (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER,
    company_id     INTEGER REFERENCES client_companies(id),
    form_name      TEXT,
    due_date       TEXT,
    status         TEXT DEFAULT 'pending',
    filed_date     TEXT,
    notes          TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_queries_user ON queries(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge_base(category);
  CREATE INDEX IF NOT EXISTS idx_knowledge_search ON knowledge_base(title, content);
  CREATE INDEX IF NOT EXISTS idx_mistakes_cat ON mistakes(category);
  CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(template_type);
  CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_compliance_due ON compliance_tracker(due_date);
`)

export default db
