// src/services/mappingMemory.service.js
// ─────────────────────────────────────────────────────────────────────────────
// MAPPING MEMORY — Learning Intelligence Layer
//
// How it works:
//   Every confirmed manual mapping writes to MappingMemory.
//   Every auto-map run checks MappingMemory BEFORE checking the master table.
//
// Priority hierarchy (highest → lowest):
//   1. Client-specific memory  (clientId set)       — this client always uses this name
//   2. Firm-wide memory        (clientId = null)    — your firm has seen this before
//   3. Master table exact match
//   4. Master table fuzzy match
//   5. IFRS heuristics (for IFRS method)
//   6. Flag as unmapped
//
// Similarity algorithm:
//   Token overlap ratio — splits both strings into word tokens,
//   computes intersection / union (Jaccard similarity).
//   Threshold: 0.6 = 60% token overlap required to auto-apply.
//   Between 0.4-0.6 = suggested but flagged for review.
//   Below 0.4 = not applied.
//
//   This handles real-world cases like:
//     "Sundry Creditors - Related Party" → matches "Sundry Creditors" at ~0.67
//     "Trade Payables (Group Companies)" → matches "Trade Payables" at ~0.67
//     "Cash & Bank Balances" → matches "Cash and Bank" at ~0.60
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');

const AUTO_APPLY_THRESHOLD  = 0.60; // confidence >= this → auto-map silently
const SUGGEST_THRESHOLD     = 0.40; // confidence >= this → suggest but flag for review

// ── Text normalisation ────────────────────────────────────────────────────────

/**
 * Normalise a subGrouping string for storage and comparison.
 * Strips punctuation, lowercases, collapses spaces.
 */
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

/**
 * Tokenise a normalised string into word set.
 * Removes common stop words that add noise to matching.
 */
const STOP_WORDS = new Set(['and', 'or', 'the', 'of', 'in', 'at', 'to', 'for',
  'a', 'an', 'by', 'with', 'from', 'as', 'on', 'is', 'are', 'was', 'be']);

function tokenize(normalizedText) {
  return new Set(
    normalizedText.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

/**
 * Jaccard similarity between two token sets.
 * Returns 0.0 to 1.0.
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Score a raw TB subGrouping against a memory entry's normalizedText.
 * Returns 0.0 to 1.0.
 */
function scoreMatch(inputNormalized, memoryNormalized) {
  // Exact match → perfect score
  if (inputNormalized === memoryNormalized) return 1.0;

  // One contains the other exactly → very high score
  if (inputNormalized.includes(memoryNormalized) || memoryNormalized.includes(inputNormalized)) {
    return 0.85;
  }

  // Token overlap (Jaccard)
  const tokensA = tokenize(inputNormalized);
  const tokensB = tokenize(memoryNormalized);
  return jaccardSimilarity(tokensA, tokensB);
}

// ── Memory read ───────────────────────────────────────────────────────────────

/**
 * Find the best memory match for a given subGrouping text.
 *
 * @param {string} rawText       — TB subGrouping as-is
 * @param {string} firmId
 * @param {string|null} clientId — pass clientId to check client-specific layer first
 * @param {string} method        — AS | IND_AS | IFRS | IFRS_SME
 *
 * @returns {{ match: MappingMemory|null, score: number, source: 'client'|'firm'|null }}
 */
async function findMemoryMatch(rawText, firmId, clientId, method) {
  const normalized = normalize(rawText);

  // Load all memory entries for this firm + method in one query
  // (client-specific entries for this client + firm-wide entries)
  const candidates = await prisma.mappingMemory.findMany({
    where: {
      firmId,
      method,
      OR: [
        { clientId: clientId || undefined },
        { clientId: null },
      ],
    },
    orderBy: [
      { confirmCount: 'desc' },   // more confirmed = higher priority when scores tie
      { lastConfirmedAt: 'desc' },
    ],
  });

  if (candidates.length === 0) return { match: null, score: 0, source: null };

  let bestMatch      = null;
  let bestScore      = 0;
  let bestSource     = null;

  for (const entry of candidates) {
    const score = scoreMatch(normalized, entry.normalizedText);
    const source = entry.clientId ? 'client' : 'firm';

    // Client-specific entries get a bonus multiplier (they outrank firm-wide at same score)
    const adjustedScore = source === 'client' ? score * 1.05 : score;

    if (adjustedScore > bestScore) {
      bestScore  = adjustedScore;
      bestMatch  = entry;
      bestSource = source;
    }
  }

  // Cap score back to 1.0 after client bonus
  const finalScore = Math.min(bestScore, 1.0);

  return { match: bestMatch, score: finalScore, source: bestSource };
}

// ── Memory write ──────────────────────────────────────────────────────────────

/**
 * Record a confirmed mapping into memory.
 * Called every time:
 *   - A user manually saves/corrects a mapping (saveManualMapping)
 *   - An auto-mapped item is accepted without correction (optional — see below)
 *
 * If an entry already exists, increments confirmCount and updates the mapping
 * in case the user changed the FS head assignment.
 *
 * @param {object} params
 * @param {string} params.firmId
 * @param {string|null} params.clientId   — null for firm-wide
 * @param {string} params.rawText         — original TB subGrouping text
 * @param {string} params.groupName
 * @param {string|null} params.subGroupName
 * @param {string|null} params.subGroupNo
 * @param {string|null} params.noteGroupId
 * @param {string|null} params.masterGroupingId
 * @param {string} params.method
 * @param {string|null} params.engagementId
 */
async function recordMemory({
  firmId, clientId = null, rawText,
  groupName, subGroupName = null, subGroupNo = null,
  noteGroupId = null, masterGroupingId = null,
  method, engagementId = null,
}) {
  const normalizedText = normalize(rawText);

  // Upsert: increment confirmCount if exists, create if new
  await prisma.mappingMemory.upsert({
    where: {
      firmId_clientId_normalizedText_method: {
        firmId,
        clientId: clientId || null,
        normalizedText,
        method,
      },
    },
    update: {
      // Update the mapping in case user corrected it
      groupName,
      subGroupName,
      subGroupNo,
      noteGroupId,
      masterGroupingId,
      rawText,                // keep most recent raw text for reference
      confirmCount:     { increment: 1 },
      lastConfirmedAt:  new Date(),
      lastEngagementId: engagementId,
      updatedAt:        new Date(),
    },
    create: {
      firmId,
      clientId,
      rawText,
      normalizedText,
      groupName,
      subGroupName,
      subGroupNo,
      noteGroupId,
      masterGroupingId,
      method,
      confirmCount:     1,
      lastConfirmedAt:  new Date(),
      lastEngagementId: engagementId,
    },
  });

  // Also write a firm-wide entry if this was a client-specific one
  // (so the firm benefits even when working on different clients)
  if (clientId) {
    await prisma.mappingMemory.upsert({
      where: {
        firmId_clientId_normalizedText_method: {
          firmId,
          clientId: null,
          normalizedText,
          method,
        },
      },
      update: {
        confirmCount:     { increment: 1 },
        lastConfirmedAt:  new Date(),
        lastEngagementId: engagementId,
        updatedAt:        new Date(),
      },
      create: {
        firmId,
        clientId:        null,
        rawText,
        normalizedText,
        groupName,
        subGroupName,
        subGroupNo,
        noteGroupId,
        masterGroupingId,
        method,
        confirmCount:     1,
        lastConfirmedAt:  new Date(),
        lastEngagementId: engagementId,
      },
    });
  }
}

// ── Bulk memory application ───────────────────────────────────────────────────

/**
 * Apply memory to a list of unmapped subGroupings.
 * Returns three buckets:
 *   - autoMapped:  confidence >= AUTO_APPLY_THRESHOLD  → applied silently
 *   - suggested:   confidence >= SUGGEST_THRESHOLD     → shown to user for confirmation
 *   - stillUnmapped: below threshold                  → user must map manually
 *
 * @param {string[]} subGroupings   — list of subGrouping texts to resolve
 * @param {string} firmId
 * @param {string|null} clientId
 * @param {string} method
 * @returns {Promise<{ autoMapped: Array, suggested: Array, stillUnmapped: string[] }>}
 */
async function applyMemoryToUnmapped(subGroupings, firmId, clientId, method) {
  const autoMapped    = [];
  const suggested     = [];
  const stillUnmapped = [];

  for (const sg of subGroupings) {
    const { match, score, source } = await findMemoryMatch(sg, firmId, clientId, method);

    if (!match || score < SUGGEST_THRESHOLD) {
      stillUnmapped.push(sg);
      continue;
    }

    const result = {
      subGrouping:     sg,
      groupName:       match.groupName,
      subGroupName:    match.subGroupName,
      subGroupNo:      match.subGroupNo,
      noteGroupId:     match.noteGroupId,
      masterGroupingId: match.masterGroupingId,
      confidence:      Math.round(score * 100),
      source,          // 'client' | 'firm'
      confirmCount:    match.confirmCount,
    };

    if (score >= AUTO_APPLY_THRESHOLD) {
      autoMapped.push(result);
    } else {
      suggested.push(result);
    }
  }

  return { autoMapped, suggested, stillUnmapped };
}

// ── Stats / introspection ─────────────────────────────────────────────────────

/**
 * Return memory stats for a firm — used in the UI to show learning progress.
 */
async function getMemoryStats(firmId, method) {
  const [total, clientSpecific, topEntries] = await Promise.all([
    prisma.mappingMemory.count({ where: { firmId, method } }),
    prisma.mappingMemory.count({ where: { firmId, method, clientId: { not: null } } }),
    prisma.mappingMemory.findMany({
      where: { firmId, method },
      orderBy: { confirmCount: 'desc' },
      take: 5,
      select: { normalizedText: true, groupName: true, confirmCount: true, clientId: true },
    }),
  ]);

  return {
    totalEntries:    total,
    firmWide:        total - clientSpecific,
    clientSpecific,
    autoApplyThreshold: AUTO_APPLY_THRESHOLD,
    topEntries,
  };
}

module.exports = {
  normalize,
  scoreMatch,
  findMemoryMatch,
  recordMemory,
  applyMemoryToUnmapped,
  getMemoryStats,
  AUTO_APPLY_THRESHOLD,
  SUGGEST_THRESHOLD,
};
