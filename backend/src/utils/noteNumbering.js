// src/utils/noteNumbering.js
'use strict';

// ── Mandatory notes per method ────────────────────────────────────────────────
// These are fixed numbers that never change regardless of what TB is uploaded.
// Data notes start immediately after the last mandatory note number.
const MANDATORY_NOTES = {
  AS: [
    { noteGroupId: '__GENERAL_INFO__',      noteNumber: 1, title: 'General Information' },
    { noteGroupId: '__ACCOUNTING_POLICY__', noteNumber: 2, title: 'Significant Accounting Policies' },
  ],
  IND_AS: [
    { noteGroupId: '__NOTES_TO_FS__',       noteNumber: 1, title: 'Notes to Financial Statements' },
    { noteGroupId: '__ACCOUNTING_POLICY__', noteNumber: 2, title: 'Significant Accounting Policies' },
    { noteGroupId: '__JUDGEMENTS__',        noteNumber: 3, title: 'Significant Judgements and Estimates' },
    { noteGroupId: '__ESTIMATES__',         noteNumber: 4, title: 'Key Sources of Estimation Uncertainty' },
  ],
  IFRS: [
    { noteGroupId: '__NOTES_TO_FS__',       noteNumber: 1, title: 'Notes to Financial Statements' },
    { noteGroupId: '__ACCOUNTING_POLICY__', noteNumber: 2, title: 'Material Accounting Policies' },
    { noteGroupId: '__CUSTOM_3__',          noteNumber: 3, title: 'Significant Judgements' },
    { noteGroupId: '__CUSTOM_4__',          noteNumber: 4, title: 'Key Estimates' },
  ],
  IFRS_SME: [
    { noteGroupId: '__NOTES_TO_FS__',       noteNumber: 1, title: 'Notes to Financial Statements' },
    { noteGroupId: '__ACCOUNTING_POLICY__', noteNumber: 2, title: 'Accounting Policies' },
    { noteGroupId: '__CUSTOM_3__',          noteNumber: 3, title: 'Significant Judgements' },
  ],
};

// ── FS display order for data notes ──────────────────────────────────────────
// Notes must appear in the order their parent FS line appears on the statements.
// This order is: BS (Equity first for AS/IndAS, Assets first for IFRS) → PL → OCI.
// Within BS, the Schedule III / IAS 1 order is reflected in the master seed's displayOrder.
// We honour the FS generation sort order — noteGroupIds are passed in already sorted.

/**
 * Assign strictly sequential note numbers to an ordered array of noteGroupIds.
 * The input array MUST already be in FS display order (sorted by sheet + AL + displayOrder).
 *
 * Rules:
 *   - Mandatory notes get their fixed numbers first.
 *   - Data notes get consecutive numbers starting right after mandatory.
 *   - Each unique noteGroupId gets exactly one number — no gaps, no skips.
 *   - If the same noteGroupId appears multiple times (shared across FS lines), it
 *     keeps its first assigned number.
 *
 * @param {string}   method       — 'AS' | 'IND_AS' | 'IFRS' | 'IFRS_SME'
 * @param {string[]} noteGroupIds — unique IDs in FS display order, no nulls
 * @returns {Map<string, number>} — noteGroupId → noteNumber
 */
function assignNoteNumbers(method, noteGroupIds) {
  const mandatory    = MANDATORY_NOTES[method] || MANDATORY_NOTES['AS'];
  const mandatoryIds = new Set(mandatory.map(m => m.noteGroupId));

  const result = new Map();

  // Step 1: seed mandatory notes with their fixed numbers
  for (const m of mandatory) {
    result.set(m.noteGroupId, m.noteNumber);
  }

  // Step 2: filter to data-only noteGroupIds (exclude mandatory, exclude nulls/empty)
  // Deduplicate while preserving order — first occurrence wins
  const seen      = new Set();
  const dataIds   = [];
  for (const id of noteGroupIds) {
    if (!id || mandatoryIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    dataIds.push(id);
  }

  // Step 3: assign strictly sequential numbers starting right after mandatory
  const startFrom = mandatory.length + 1;
  let counter     = startFrom;
  for (const id of dataIds) {
    result.set(id, counter++);
  }

  return result;
}

function getMandatoryNotes(method) {
  return MANDATORY_NOTES[method] || MANDATORY_NOTES['AS'];
}

module.exports = { assignNoteNumbers, getMandatoryNotes };
