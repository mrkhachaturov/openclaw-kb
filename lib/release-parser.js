/**
 * Release Metadata Parser
 * Extracts changelog, commit info, and appcast notes from git history
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Extract full release metadata from git
 * @param {string} currentTag - Current release tag (e.g., 'v2026.2.12')
 * @param {string} previousTag - Previous release tag
 * @param {string} upstreamDir - Path to upstream git repo
 * @returns {Object} Release metadata
 */
export function extractReleaseMetadata(currentTag, previousTag, upstreamDir) {
  const tagInfo = getTagInfo(currentTag, upstreamDir);
  const commits = getCommitLog(previousTag, currentTag, upstreamDir);
  const changelog = categorizeCommits(commits);
  const appcastNotes = extractAppcastNotes(currentTag, upstreamDir);
  const kbImpact = calculateKBImpact(previousTag, currentTag, upstreamDir);

  return {
    tag: currentTag,
    commit_hash: tagInfo.commit,
    date: tagInfo.date,
    previous_tag: previousTag,
    commits_count: commits.length,
    files_changed: kbImpact.total_files,
    kb_files_changed: kbImpact.kb_files,
    kb_impact: kbImpact.impact_level,
    changelog,
    appcast_notes: appcastNotes
  };
}

/**
 * Get tag metadata (commit, date, author)
 * @param {string} tag - Git tag
 * @param {string} upstreamDir - Repo path
 * @returns {Object} Tag info
 */
function getTagInfo(tag, upstreamDir) {
  try {
    const cmd = `git show ${tag} --format='%H|%aI|%an <%ae>' --no-patch`;
    const output = execSync(cmd, { cwd: upstreamDir, encoding: 'utf-8' }).trim();
    const [commit, date, author] = output.split('|');
    return { commit, date, author };
  } catch (err) {
    console.error(`[release-parser] Failed to get tag info for ${tag}: ${err.message}`);
    return { commit: 'unknown', date: new Date().toISOString(), author: 'unknown' };
  }
}

/**
 * Get commit log between two tags
 * @param {string} fromTag - Start tag
 * @param {string} toTag - End tag
 * @param {string} upstreamDir - Repo path
 * @returns {string[]} Array of commit messages
 */
function getCommitLog(fromTag, toTag, upstreamDir) {
  try {
    const cmd = `git log ${fromTag}..${toTag} --oneline`;
    const output = execSync(cmd, { cwd: upstreamDir, encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (err) {
    console.error(`[release-parser] Failed to get commit log: ${err.message}`);
    return [];
  }
}

/**
 * Categorize commits by conventional commit type
 * @param {string[]} commits - Array of commit messages (with hashes)
 * @returns {Object} Categorized commits
 */
function categorizeCommits(commits) {
  const categories = {
    security: [],
    features: [],
    fixes: [],
    breaking: [],
    other: []
  };

  for (const commit of commits) {
    // Remove commit hash (first 7-8 chars + space)
    const message = commit.substring(commit.indexOf(' ') + 1);

    if (/^security|Security:/i.test(message)) {
      categories.security.push(message);
    } else if (/BREAKING|breaking change/i.test(message)) {
      categories.breaking.push(message);
    } else if (/^feat[:(]/i.test(message)) {
      categories.features.push(message);
    } else if (/^fix[:(]/i.test(message)) {
      categories.fixes.push(message);
    } else {
      categories.other.push(message);
    }
  }

  return categories;
}

/**
 * Extract release notes from appcast.xml if available
 * @param {string} tag - Release tag
 * @param {string} upstreamDir - Repo path
 * @returns {string|null} Release notes HTML or null
 */
function extractAppcastNotes(tag, upstreamDir) {
  try {
    const appcastPath = join(upstreamDir, 'appcast.xml');
    if (!existsSync(appcastPath)) {
      return null;
    }

    const content = readFileSync(appcastPath, 'utf-8');

    // Find the section for this version (strip 'v' prefix)
    const versionMatch = tag.replace(/^v/, '');
    const regex = new RegExp(
      `<title>${versionMatch.replace(/\./g, '\\.')}</title>.*?<description><!\\[CDATA\\[(.*?)\\]\\]></description>`,
      's'
    );

    const match = content.match(regex);
    return match ? match[1].trim() : null;

  } catch (err) {
    console.error(`[release-parser] Failed to extract appcast notes: ${err.message}`);
    return null;
  }
}

/**
 * Calculate KB impact (files changed in KB-relevant areas)
 * @param {string} fromTag - Start tag
 * @param {string} toTag - End tag
 * @param {string} upstreamDir - Repo path
 * @returns {Object} Impact assessment
 */
function calculateKBImpact(fromTag, toTag, upstreamDir) {
  try {
    const cmd = `git diff --name-only ${fromTag}..${toTag}`;
    const output = execSync(cmd, { cwd: upstreamDir, encoding: 'utf-8' });
    const files = output.trim().split('\n').filter(Boolean);

    // KB-relevant prefixes (matching sync-latest-tag.sh)
    const KB_PREFIXES = /^(docs\/|src\/config\/|src\/gateway\/|src\/telegram\/|skills\/|src\/agents\/|src\/memory\/|src\/infra\/|src\/security\/|src\/hooks\/|src\/sessions\/|src\/channels\/|src\/providers\/|src\/plugins\/)/;

    const docsChanged = files.filter(f => f.startsWith('docs/')).length;
    const codeChanged = files.filter(f => f.startsWith('src/')).length;
    const kbFiles = files.filter(f => KB_PREFIXES.test(f)).length;

    // Classify impact level
    let impactLevel = 'none';
    if (kbFiles > 20) impactLevel = 'high';
    else if (kbFiles >= 5) impactLevel = 'medium';
    else if (kbFiles > 0) impactLevel = 'low';

    return {
      total_files: files.length,
      docs_changed: docsChanged,
      code_changed: codeChanged,
      kb_files: kbFiles,
      impact_level: impactLevel
    };

  } catch (err) {
    console.error(`[release-parser] Failed to calculate KB impact: ${err.message}`);
    return {
      total_files: 0,
      docs_changed: 0,
      code_changed: 0,
      kb_files: 0,
      impact_level: 'unknown'
    };
  }
}

/**
 * Format release metadata as searchable markdown
 * @param {Object} metadata - Release metadata from extractReleaseMetadata
 * @returns {string} Markdown-formatted changelog
 */
export function formatChangelogMarkdown(metadata) {
  const { tag, date, previous_tag, commits_count, changelog, kb_files_changed, kb_impact } = metadata;

  const dateStr = date.split('T')[0]; // YYYY-MM-DD only
  let md = `# Release ${tag} (${dateStr})\n\n`;

  if (previous_tag) {
    md += `${commits_count} commits since ${previous_tag}\n\n`;
  }

  // Security fixes (highest priority)
  if (changelog.security && changelog.security.length > 0) {
    md += `## Security Fixes\n\n`;
    for (const commit of changelog.security) {
      md += `- ${commit}\n`;
    }
    md += '\n';
  }

  // Breaking changes (important)
  if (changelog.breaking && changelog.breaking.length > 0) {
    md += `## Breaking Changes\n\n`;
    for (const commit of changelog.breaking) {
      md += `- ${commit}\n`;
    }
    md += '\n';
  }

  // Features
  if (changelog.features && changelog.features.length > 0) {
    md += `## Features\n\n`;
    for (const commit of changelog.features) {
      md += `- ${commit}\n`;
    }
    md += '\n';
  }

  // Bug fixes
  if (changelog.fixes && changelog.fixes.length > 0) {
    md += `## Bug Fixes\n\n`;
    for (const commit of changelog.fixes) {
      md += `- ${commit}\n`;
    }
    md += '\n';
  }

  // Other changes (if significant)
  if (changelog.other && changelog.other.length > 0 && changelog.other.length <= 10) {
    md += `## Other Changes\n\n`;
    for (const commit of changelog.other) {
      md += `- ${commit}\n`;
    }
    md += '\n';
  }

  // KB impact summary
  md += `## Knowledge Base Impact\n\n`;
  md += `- ${kb_files_changed} KB-relevant files changed\n`;
  md += `- Impact level: ${kb_impact}\n`;

  // Add appcast notes if available
  if (metadata.appcast_notes) {
    md += `\n## Release Notes\n\n`;
    md += metadata.appcast_notes + '\n';
  }

  return md;
}
