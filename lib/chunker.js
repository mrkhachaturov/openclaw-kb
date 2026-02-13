import { createHash } from 'node:crypto';
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS } from './config.js';

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
  }

  // Language detection
  const language = ext === 'md' ? 'markdown'
                 : ext === 'ts' ? 'typescript'
                 : ext === 'js' ? 'javascript'
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

export function chunkFile(content, relPath, source) {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  // Derive metadata for this file
  const metadata = deriveMetadata(relPath, source);

  // File-type detection: use smaller max size for code files
  const isCodeFile = metadata.language === 'typescript' || metadata.language === 'javascript';
  const maxChars = isCodeFile ? 1200 : CHUNK_MAX_CHARS;

  const chunks = [];
  let chunkLines = [];
  let chunkStart = 1; // 1-indexed
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
        chunks.push(buildChunk(chunkLines, chunkStart, i, relPath, source, metadata));

        // Start new chunk with overlap
        const { overlapLines, overlapStart } = getOverlap(chunkLines, chunkStart, i);
        chunkLines = [...overlapLines];
        chunkStart = overlapStart;
        charCount = chunkLines.reduce((sum, l) => sum + l.length + 1, 0);
      }
    }

    chunkLines.push(line);
    charCount += lineLen;
  }

  // Emit final chunk
  if (chunkLines.length > 0) {
    chunks.push(buildChunk(chunkLines, chunkStart, lines.length, relPath, source, metadata));
  }

  return chunks;
}

function buildChunk(lines, startLine, endLineExclusive, relPath, source, metadata) {
  const text = `// File: ${relPath} (lines ${startLine}-${endLineExclusive})\n${lines.join('\n')}`;
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
    contentType: metadata.contentType,
    language: metadata.language,
    category: metadata.category,
  };
}

function getOverlap(chunkLines, chunkStart, currentLineIndex) {
  let overlapChars = 0;
  let overlapLines = [];

  for (let j = chunkLines.length - 1; j >= 0; j--) {
    overlapChars += chunkLines[j].length + 1;
    if (overlapChars > CHUNK_OVERLAP_CHARS) break;
    overlapLines.unshift(chunkLines[j]);
  }

  const overlapStart = currentLineIndex - overlapLines.length + 1;
  return { overlapLines, overlapStart };
}
