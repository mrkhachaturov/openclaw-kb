import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { DB_PATH, EMBEDDING_DIMS, VECTOR_WEIGHT, TEXT_WEIGHT } from './config.js';

const require = createRequire(import.meta.url);

let db = null;
let vecLoaded = false;

/**
 * Open (or create) the SQLite database and initialize schema.
 * @returns {DatabaseSync}
 */
export function openDb() {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH, { allowExtension: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');

  // Load sqlite-vec extension
  try {
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    vecLoaded = true;
  } catch (e) {
    console.error(`Warning: sqlite-vec not available (${e.message}). Vector search disabled.`);
  }

  initSchema();
  return db;
}

/**
 * Close the database connection.
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
    vecLoaded = false;
  }
}

function initSchema() {
  // Create tables
  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
  `;

  db.exec(createTablesSQL);

  // Releases table for tracking upstream versions
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS releases (
        tag TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        previous_tag TEXT,
        commits_count INTEGER,
        files_changed INTEGER,
        kb_files_changed INTEGER,
        kb_impact TEXT,
        changelog_json TEXT,
        indexed_at INTEGER
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_releases_date ON releases(date DESC);
    `);
  } catch (e) {
    console.error('[db] Warning: Failed to create releases table:', e.message);
  }

  // Migrate: Add metadata columns if they don't exist
  try {
    db.exec('ALTER TABLE chunks ADD COLUMN content_type TEXT DEFAULT \'unknown\'');
  } catch (e) {
    // Column already exists, that's fine
  }

  try {
    db.exec('ALTER TABLE chunks ADD COLUMN language TEXT');
  } catch (e) {
    // Column already exists, that's fine
  }

  try {
    db.exec('ALTER TABLE chunks ADD COLUMN category TEXT');
  } catch (e) {
    // Column already exists, that's fine
  }

  // Migrate: Add indexed_release column to chunks
  try {
    db.exec('ALTER TABLE chunks ADD COLUMN indexed_release TEXT DEFAULT NULL');
  } catch (e) {
    // Column already exists, that's fine
  }

  // Migrate: Add indexed_release column to files
  try {
    db.exec('ALTER TABLE files ADD COLUMN indexed_release TEXT DEFAULT NULL');
  } catch (e) {
    // Column already exists, that's fine
  }

  // Create indexes for new columns
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_content_type ON chunks(content_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_language ON chunks(language)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_category ON chunks(category)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_indexed_release ON chunks(indexed_release)');
  } catch (e) {
    // Indexes might already exist
  }

  // FTS5 for keyword search with metadata for filtering
  try {
    // Check if FTS table needs migration (drop if schema changed)
    let needsRecreate = false;

    try {
      // Check if indexed_release column exists in FTS table
      db.prepare("SELECT indexed_release FROM chunks_fts LIMIT 0").all();
    } catch {
      // indexed_release column missing or table doesn't exist, need to recreate
      needsRecreate = true;
    }

    if (needsRecreate) {
      try {
        db.exec('DROP TABLE IF EXISTS chunks_fts');
        console.log('[db] Dropped FTS table for schema update');
      } catch {
        // Table might not exist, that's fine
      }
    }

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        id UNINDEXED,
        path UNINDEXED,
        source UNINDEXED,
        content_type UNINDEXED,
        language UNINDEXED,
        indexed_release UNINDEXED
      );
    `);
  } catch (e) {
    console.error(`Warning: FTS5 not available (${e.message}).`);
  }

  // Vector table via sqlite-vec
  if (vecLoaded) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
          id TEXT PRIMARY KEY,
          embedding float32[${EMBEDDING_DIMS}]
        );
      `);
    } catch (e) {
      // Table might already exist
      if (!e.message.includes('already exists')) {
        console.error(`Warning: vec0 table creation failed (${e.message}).`);
        vecLoaded = false;
      }
    }
  }
}

// --- File tracking ---

const stmtCache = {};
function prepare(sql) {
  if (!stmtCache[sql]) stmtCache[sql] = db.prepare(sql);
  return stmtCache[sql];
}

export function getFileHash(path) {
  const row = prepare('SELECT hash FROM files WHERE path = ?').get(path);
  return row ? row.hash : null;
}

export function upsertFile(path, source, hash, indexedRelease = null) {
  prepare(`
    INSERT INTO files (path, source, hash, indexed_at, indexed_release)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET source=?, hash=?, indexed_at=?, indexed_release=?
  `).run(path, source, hash, Date.now(), indexedRelease, source, hash, Date.now(), indexedRelease);
}

export function getAllFilePaths() {
  return prepare('SELECT path FROM files').all().map(r => r.path);
}

export function deleteFile(path) {
  prepare('DELETE FROM files WHERE path = ?').run(path);
}

// --- Chunk operations ---

export function getChunkHashes(path) {
  return prepare('SELECT id, hash FROM chunks WHERE path = ?')
    .all(path)
    .reduce((map, r) => { map[r.id] = r.hash; return map; }, {});
}

export function deleteChunksByPath(path) {
  const ids = prepare('SELECT id FROM chunks WHERE path = ?').all(path).map(r => r.id);

  if (ids.length === 0) return;

  prepare('DELETE FROM chunks WHERE path = ?').run(path);

  // Delete from FTS
  for (const id of ids) {
    try {
      prepare('DELETE FROM chunks_fts WHERE id = ?').run(id);
    } catch { /* ignore if not in FTS */ }
  }

  // Delete from vector table
  if (vecLoaded) {
    for (const id of ids) {
      try {
        prepare('DELETE FROM chunks_vec WHERE id = ?').run(id);
      } catch { /* ignore */ }
    }
  }
}

/**
 * Insert chunks and their embeddings into all three tables.
 * @param {{ id: string, path: string, source: string, startLine: number, endLine: number, text: string, hash: string, contentType: string, language: string, category: string }[]} chunks
 * @param {number[][]} embeddings - parallel array of embedding vectors
 * @param {string|null} indexedRelease - Release tag that indexed these chunks (e.g., 'v2026.2.12')
 */
export function insertChunks(chunks, embeddings, indexedRelease = null) {
  const insertChunk = prepare(`
    INSERT OR REPLACE INTO chunks (id, path, source, start_line, end_line, hash, text, content_type, language, category, indexed_release)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = prepare(`
    INSERT OR REPLACE INTO chunks_fts (text, id, path, source, content_type, language, indexed_release)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVec = vecLoaded ? prepare(`
    INSERT OR REPLACE INTO chunks_vec (id, embedding)
    VALUES (?, ?)
  `) : null;

  const createTablesSQLForTransaction = 'BEGIN';
  db.exec(createTablesSQLForTransaction);
  try {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      insertChunk.run(
        c.id, c.path, c.source, c.startLine, c.endLine, c.hash, c.text,
        c.contentType || 'unknown', c.language || null, c.category || null,
        indexedRelease
      );

      try {
        insertFts.run(c.text, c.id, c.path, c.source, c.contentType || 'unknown', c.language || null, indexedRelease);
      } catch (ftsErr) {
        console.error(`[db] FTS insert failed for chunk ${c.id}: ${ftsErr.message}`);
        // FTS insert failure is non-fatal, continue indexing
      }

      if (insertVec && embeddings[i]) {
        const blob = vectorToBlob(embeddings[i]);
        insertVec.run(c.id, blob);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// --- Search ---

/**
 * Vector similarity search via sqlite-vec.
 * @param {number[]} queryEmbedding
 * @param {number} limit
 * @param {string|null} sourceFilter
 * @param {string|null} contentTypeFilter
 * @returns {{ id: string, path: string, source: string, contentType: string, language: string, category: string, startLine: number, endLine: number, text: string, score: number }[]}
 */
export function searchVector(queryEmbedding, limit = 10, sourceFilter = null, contentTypeFilter = null) {
  if (!vecLoaded) return [];

  const blob = vectorToBlob(queryEmbedding);
  const candidateLimit = limit * 3; // fetch extra for filtering

  const rows = prepare(`
    SELECT v.id, v.distance
    FROM chunks_vec v
    WHERE v.embedding MATCH ?
    ORDER BY v.distance
    LIMIT ?
  `).all(blob, candidateLimit);

  const results = [];
  for (const row of rows) {
    const chunk = prepare('SELECT * FROM chunks WHERE id = ?').get(row.id);
    if (!chunk) continue;
    if (sourceFilter && chunk.source !== sourceFilter) continue;
    if (contentTypeFilter && chunk.content_type !== contentTypeFilter) continue;

    results.push({
      id: chunk.id,
      path: chunk.path,
      source: chunk.source,
      contentType: chunk.content_type,
      language: chunk.language,
      category: chunk.category,
      startLine: chunk.start_line,
      endLine: chunk.end_line,
      text: chunk.text,
      score: 1 - row.distance, // distance to similarity
    });

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Full-text keyword search via FTS5 BM25.
 * @param {string} query
 * @param {number} limit
 * @param {string|null} sourceFilter
 * @param {string|null} contentTypeFilter
 * @returns {{ id: string, path: string, source: string, contentType: string, language: string, category: string, startLine: number, endLine: number, text: string, score: number }[]}
 */
export function searchFTS(query, limit = 10, sourceFilter = null, contentTypeFilter = null) {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const candidateLimit = limit * 3;

  let sql, params;
  if (sourceFilter && contentTypeFilter) {
    sql = `
      SELECT id, path, source, content_type, language, text, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ? AND source = ? AND content_type = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [ftsQuery, sourceFilter, contentTypeFilter, candidateLimit];
  } else if (sourceFilter) {
    sql = `
      SELECT id, path, source, content_type, language, text, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ? AND source = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [ftsQuery, sourceFilter, candidateLimit];
  } else if (contentTypeFilter) {
    sql = `
      SELECT id, path, source, content_type, language, text, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ? AND content_type = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [ftsQuery, contentTypeFilter, candidateLimit];
  } else {
    sql = `
      SELECT id, path, source, content_type, language, text, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [ftsQuery, candidateLimit];
  }

  try {
    const rows = prepare(sql).all(...params);
    return rows.map(r => {
      const chunk = prepare('SELECT * FROM chunks WHERE id = ?').get(r.id);
      return {
        id: r.id,
        path: chunk ? chunk.path : r.path,
        source: chunk ? chunk.source : r.source,
        contentType: chunk ? chunk.content_type : r.content_type,
        language: chunk ? chunk.language : r.language,
        category: chunk ? chunk.category : null,
        startLine: chunk ? chunk.start_line : 0,
        endLine: chunk ? chunk.end_line : 0,
        text: r.text,
        score: bm25RankToScore(r.rank),
      };
    }).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Hybrid search merging vector + keyword results.
 * @param {number[]} queryEmbedding
 * @param {string} queryText
 * @param {number} limit
 * @param {string|null} sourceFilter
 * @param {string|null} contentTypeFilter
 * @returns {{ id: string, path: string, source: string, contentType: string, language: string, category: string, startLine: number, endLine: number, text: string, score: number }[]}
 */
export function hybridSearch(queryEmbedding, queryText, limit = 8, sourceFilter = null, contentTypeFilter = null) {
  const vecResults = searchVector(queryEmbedding, limit * 2, sourceFilter, contentTypeFilter);
  const ftsResults = searchFTS(queryText, limit * 2, sourceFilter, contentTypeFilter);

  // Build rank maps (1-based positions)
  const vectorRanks = new Map();
  const textRanks = new Map();

  vecResults.forEach((r, idx) => vectorRanks.set(r.id, idx + 1));
  ftsResults.forEach((r, idx) => textRanks.set(r.id, idx + 1));

  // Merge by ID, tracking ranks
  const merged = new Map();

  for (const r of vecResults) {
    merged.set(r.id, {
      ...r,
      vectorScore: r.score,
      textScore: 0,
      vectorRank: vectorRanks.get(r.id),
      textRank: null,
    });
  }

  for (const r of ftsResults) {
    if (merged.has(r.id)) {
      const existing = merged.get(r.id);
      existing.textScore = r.score;
      existing.textRank = textRanks.get(r.id);
    } else {
      merged.set(r.id, {
        ...r,
        vectorScore: 0,
        textScore: r.score,
        vectorRank: null,
        textRank: textRanks.get(r.id),
      });
    }
  }

  // Compute RRF scores (Reciprocal Rank Fusion)
  const RRF_K = 60; // Standard constant

  const results = [...merged.values()].map(r => {
    const vectorComponent = r.vectorRank ? 1 / (RRF_K + r.vectorRank) : 0;
    const textComponent = r.textRank ? 1 / (RRF_K + r.textRank) : 0;
    const rrfScore = vectorComponent + textComponent;

    return {
      id: r.id,
      path: r.path,
      source: r.source,
      contentType: r.contentType,
      language: r.language,
      category: r.category,
      startLine: r.startLine,
      endLine: r.endLine,
      text: r.text,
      score: rrfScore,
      // Keep for debugging
      vectorScore: r.vectorScore,
      textScore: r.textScore,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get DB stats.
 */
export function getStats() {
  const files = prepare('SELECT COUNT(*) as n FROM files').get().n;
  const chunks = prepare('SELECT COUNT(*) as n FROM chunks').get().n;
  const sources = prepare('SELECT source, COUNT(*) as n FROM chunks GROUP BY source').all();
  return { files, chunks, sources, vecLoaded };
}

/**
 * Get chunks indexed at or after a specific release.
 * @param {string} sinceRelease - Minimum release tag (e.g., 'v2026.2.9')
 * @param {number} limit - Maximum number of chunks to return
 * @returns {Array} - Chunks with metadata
 */
export function getChunksSinceRelease(sinceRelease, limit = 100) {
  const rows = prepare(`
    SELECT id, path, source, content_type, language, category, indexed_release,
           start_line, end_line, text
    FROM chunks
    WHERE indexed_release >= ?
    ORDER BY indexed_release DESC, path ASC
    LIMIT ?
  `).all(sinceRelease, limit);

  return rows.map(r => ({
    id: r.id,
    path: r.path,
    source: r.source,
    contentType: r.content_type,
    language: r.language,
    category: r.category,
    indexedRelease: r.indexed_release,
    startLine: r.start_line,
    endLine: r.end_line,
    text: r.text,
  }));
}

// --- Release tracking ---

/**
 * Insert or update release metadata.
 * @param {Object} metadata - Release metadata object
 */
export function insertRelease(metadata) {
  prepare(`
    INSERT OR REPLACE INTO releases (
      tag, date, commit_hash, previous_tag, commits_count,
      files_changed, kb_files_changed, kb_impact, changelog_json, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    metadata.tag,
    metadata.date,
    metadata.commit_hash || metadata.commit,
    metadata.previous_tag || null,
    metadata.commits_count || 0,
    metadata.files_changed || 0,
    metadata.kb_files_changed || 0,
    metadata.kb_impact || 'unknown',
    metadata.changelog ? JSON.stringify(metadata.changelog) : null,
    Date.now()
  );
}

/**
 * Get the most recent release.
 * @returns {Object|null} - Latest release metadata
 */
export function getLatestRelease() {
  return prepare('SELECT * FROM releases ORDER BY date DESC LIMIT 1').get() || null;
}

/**
 * Get release history.
 * @param {number} limit - Number of releases to return
 * @returns {Object[]} - Array of release metadata
 */
export function getReleaseHistory(limit = 10) {
  return prepare('SELECT * FROM releases ORDER BY date DESC LIMIT ?').all(limit);
}

/**
 * Get release by tag.
 * @param {string} tag - Release tag (e.g., 'v2026.2.12')
 * @returns {Object|null} - Release metadata or null
 */
export function getReleaseByTag(tag) {
  return prepare('SELECT * FROM releases WHERE tag = ?').get(tag) || null;
}

// --- Helpers ---

function vectorToBlob(embedding) {
  return Buffer.from(new Float32Array(embedding).buffer);
}

function buildFtsQuery(raw) {
  const tokens = raw.match(/[A-Za-z0-9_]+/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
}

function bm25RankToScore(rank) {
  const normalized = Number.isFinite(rank) ? Math.abs(rank) : 999;
  return 1 / (1 + normalized);
}
