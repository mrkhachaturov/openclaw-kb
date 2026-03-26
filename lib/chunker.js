import { createHash } from 'node:crypto';
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, MAX_EMBEDDING_SAFE_CHARS } from './config.js';

/**
 * Chunk a file into semantically coherent pieces.
 * Prefers splitting at markdown headings and blank lines.
 *
 * @param {string} content - File content
 * @param {string} relPath - Relative path (for context header)
 * @param {string} source  - Source category (docs, config, etc.)
 * @returns {{ id: string, path: string, source: string, startLine: number, endLine: number, text: string, hash: string }[]}
 */
/**
 * Derive metadata from file path and source for content type filtering.
 */
function deriveMetadata(relPath, source) {
  const ext = relPath.split('.').pop();

  // Content type classification
  let contentType = 'unknown';
  if (ext === 'md') {
    contentType = relPath.includes('skills/') ? 'skill' : 'docs';
  } else if (ext === 'ts' || ext === 'js') {
    contentType = (relPath.includes('zod-schema') || relPath.includes('types.'))
      ? 'config'
      : 'code';
  } else if (ext === 'swift') {
    contentType = 'code';
  }

  // Language detection
  const language = ext === 'md' ? 'markdown'
                 : ext === 'ts' ? 'typescript'
                 : ext === 'js' ? 'javascript'
                 : ext === 'swift' ? 'swift'
                 : null;

  // Category mapping (broader than source)
  const categoryMap = {
    docs: 'documentation',
    config: 'config-schema',
    gateway: 'core',
    telegram: 'channels',
    channels: 'channels',
    skills: 'skills',
    'skill-examples': 'skills',
    agents: 'core',
    memory: 'core',
    infra: 'infrastructure',
    security: 'security',
    hooks: 'automation',
    sessions: 'core',
    providers: 'integrations',
    plugins: 'plugins',
  };

  return {
    contentType,
    language,
    category: categoryMap[source] || source,
  };
}

/**
 * Chunk CHANGELOG.md by version section boundaries.
 * Only keeps the most recent MAX_CHANGELOG_VERSIONS versions.
 * Splits oversized version sections to stay under embedding token limits.
 */
const MAX_CHANGELOG_VERSIONS = 3;
const MAX_CHANGELOG_CHUNK_CHARS = MAX_EMBEDDING_SAFE_CHARS;
const MAX_LINE_FRAGMENT_CHARS = Math.max(500, MAX_EMBEDDING_SAFE_CHARS - 250);

export function chunkChangelog(content, relPath, source) {
  const versionPattern = /^## \[?(?:Unreleased|(v?[\d.]+[^\]]*))\]?/;
  const lines = content.split('\n');
  const chunks = [];

  let currentVersion = null;
  let currentLines = [];
  let currentStart = 1;
  let versionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(versionPattern);

    if (match && currentLines.length > 0 && currentVersion) {
      chunks.push(...buildChangelogChunks(currentLines, currentStart, i, relPath, source, currentVersion));
      currentLines = [];
      currentStart = i + 1;
      versionCount++;
      if (versionCount >= MAX_CHANGELOG_VERSIONS) break;
    }

    if (match) {
      currentVersion = match[1] || 'unreleased';
      if (currentLines.length === 0) currentStart = i + 1;
    }

    currentLines.push(lines[i]);
  }

  if (currentLines.length > 0 && currentVersion && versionCount < MAX_CHANGELOG_VERSIONS) {
    chunks.push(...buildChangelogChunks(currentLines, currentStart, lines.length, relPath, source, currentVersion));
  }

  return chunks;
}

/** Split a version section into multiple chunks if it exceeds the size limit. */
function buildChangelogChunks(lines, startLine, endLineExclusive, relPath, source, version) {
  const fullText = lines.join('\n');
  if (fullText.length <= MAX_CHANGELOG_CHUNK_CHARS) {
    return [buildChangelogChunk(lines, startLine, endLineExclusive, relPath, source, version)];
  }

  const chunks = [];
  let chunkLines = [];
  let chunkStart = startLine;
  let chunkLen = 0;
  let part = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1;
    if (chunkLen + lineLen > MAX_CHANGELOG_CHUNK_CHARS && chunkLines.length > 0) {
      chunks.push(buildChangelogChunk(chunkLines, chunkStart, startLine + i, relPath, source, `${version} (part ${part})`));
      chunkLines = [];
      chunkStart = startLine + i;
      chunkLen = 0;
      part++;
    }
    chunkLines.push(lines[i]);
    chunkLen += lineLen;
  }

  if (chunkLines.length > 0) {
    chunks.push(buildChangelogChunk(chunkLines, chunkStart, endLineExclusive, relPath, source, part > 1 ? `${version} (part ${part})` : version));
  }

  return chunks;
}

function buildChangelogChunk(lines, startLine, endLineExclusive, relPath, source, version) {
  const text = buildChunkText(lines, relPath, startLine, endLineExclusive);
  const hash = createHash('sha256').update(text).digest('hex');
  const id = `${hash.slice(0, 12)}-${startLine}`;

  return {
    id,
    path: relPath,
    source,
    startLine,
    endLine: endLineExclusive,
    text,
    hash,
    contentType: 'release',
    language: 'markdown',
    category: 'release-notes',
    version,
  };
}

export function chunkFile(content, relPath, source) {
  // Version-bounded chunking for changelogs
  if (relPath.toLowerCase().endsWith('changelog.md')) {
    return chunkChangelog(content, relPath, source);
  }

  const rawLines = content.split('\n');
  if (rawLines.length === 0) return [];

  // Derive metadata for this file
  const metadata = deriveMetadata(relPath, source);
  const lineRecords = normalizeLines(rawLines);

  // File-type detection: use smaller max size for code files
  const isCodeFile = metadata.language === 'typescript' || metadata.language === 'javascript' || metadata.language === 'swift';
  const maxChars = isCodeFile ? 1200 : CHUNK_MAX_CHARS;

  const chunks = [];
  let chunkLines = [];
  let chunkStart = lineRecords[0]?.lineNo ?? 1;
  let charCount = 0;

  for (let i = 0; i < lineRecords.length; i++) {
    const record = lineRecords[i];
    const line = record.text;
    const lineLen = line.length + 1; // +1 for newline

    // Check if adding this line would exceed max chars
    // and we already have content — try to break at a good point
    if (charCount + lineLen > maxChars && chunkLines.length > 0) {
      // Check if this is a natural break point
      const isHeading = /^#{1,4}\s/.test(line);
      const isBlank = line.trim() === '';

      // Code-specific boundaries (more precise patterns)
      const isFunctionDecl = /^(export\s+)?(async\s+)?function\s+\w+/.test(line);
      const isClassDecl = /^(export\s+)?class\s+\w+/.test(line);
      const isTypeDecl = /^(export\s+)?(interface|type|enum)\s+\w+/.test(line);
      const isConstFunc = /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line);

      // Categorize boundary strength
      const isStrongBoundary = isCodeFile && (isFunctionDecl || isClassDecl || isTypeDecl || isConstFunc);
      const isWeakBoundary = isHeading || isBlank;

      // Decision: prefer strong boundaries for code, allow weak boundaries for docs
      const shouldBreak = isStrongBoundary || (!isCodeFile && isWeakBoundary) || charCount > maxChars * 1.2;

      if (shouldBreak) {
        // Emit current chunk
        chunks.push(...buildChunks(chunkLines, relPath, source, metadata));

        // Start new chunk with overlap
        const { overlapLines, overlapStart } = getOverlap(chunkLines);
        chunkLines = [...overlapLines];
        chunkStart = overlapStart;
        charCount = chunkLines.reduce((sum, item) => sum + item.text.length + 1, 0);
      }
    }

    chunkLines.push(record);
    charCount += lineLen;
  }

  // Emit final chunk
  if (chunkLines.length > 0) {
    chunks.push(...buildChunks(chunkLines, relPath, source, metadata));
  }

  return chunks;
}

function buildChunks(lines, relPath, source, metadata) {
  const chunks = [];
  let currentLines = [];

  for (const line of lines) {
    const candidateLines = [...currentLines, line];
    const candidateText = buildChunkText(
      candidateLines.map(item => item.text),
      relPath,
      candidateLines[0].lineNo,
      candidateLines[candidateLines.length - 1].lineNo
    );

    if (candidateText.length > MAX_EMBEDDING_SAFE_CHARS && currentLines.length > 0) {
      chunks.push(buildChunk(currentLines, relPath, source, metadata));
      currentLines = [line];
    } else {
      currentLines = candidateLines;
    }
  }

  if (currentLines.length > 0) {
    chunks.push(buildChunk(currentLines, relPath, source, metadata));
  }

  return chunks;
}

function buildChunk(lines, relPath, source, metadata) {
  const startLine = lines[0].lineNo;
  const endLine = lines[lines.length - 1].lineNo;
  const text = buildChunkText(lines.map(line => line.text), relPath, startLine, endLine);
  const hash = createHash('sha256').update(text).digest('hex');
  const id = `${hash.slice(0, 12)}-${startLine}`;

  return {
    id,
    path: relPath,
    source,
    startLine,
    endLine,
    text,
    hash,
    contentType: metadata.contentType,
    language: metadata.language,
    category: metadata.category,
  };
}

function buildChunkText(lines, relPath, startLine, endLine) {
  return `// File: ${relPath} (lines ${startLine}-${endLine})\n${lines.join('\n')}`;
}

function getOverlap(chunkLines) {
  let overlapChars = 0;
  let overlapLines = [];

  for (let j = chunkLines.length - 1; j >= 0; j--) {
    overlapChars += chunkLines[j].text.length + 1;
    if (overlapChars > CHUNK_OVERLAP_CHARS) break;
    overlapLines.unshift(chunkLines[j]);
  }

  const overlapStart = overlapLines[0]?.lineNo ?? chunkLines[0]?.lineNo ?? 1;
  return { overlapLines, overlapStart };
}

function normalizeLines(lines) {
  const normalized = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    if (line.length <= MAX_LINE_FRAGMENT_CHARS) {
      normalized.push({ text: line, lineNo });
      continue;
    }

    for (let start = 0; start < line.length; start += MAX_LINE_FRAGMENT_CHARS) {
      normalized.push({
        text: line.slice(start, start + MAX_LINE_FRAGMENT_CHARS),
        lineNo,
      });
    }
  }

  return normalized;
}
