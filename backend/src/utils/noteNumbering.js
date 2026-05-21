// src/utils/noteNumbering.js
// ─────────────────────────────────────────────────────────────────────────────
// NOTE SEQUENTIAL NUMBERING
//
// CRITICAL RULE: Note numbers assigned to NOTE GROUP IDs, never to rows.
// Multiple FS lines can share the same note number.
//
// AS Method note structure:
//   Note 1 → General Information (mandatory)
//   Note 2 → Accounting Policy (mandatory)
//   Note 3+ → Breakups (from noteGroupIds)
//
// IND AS Method note structure:
//   Note 1 → Notes to FS (mandatory)
//   Note 2 → Accounting Policy (mandatory)
//   Note 3 → Significant Judgements (mandatory)
//   Note 4 → Key Estimates (mandatory)
//   Note 5+ → Breakups
//
// IFRS / IFRS SME:
//   Note 1 → Notes to FS
//   Note 2 → Accounting Policy
//   Note 3 → Custom
//   Note 4 → Custom
//   Note 5+ → Breakups
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

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

/**
 * Assign sequential note numbers to an array of noteGroupIds.
 *
 * @param {string}   method         — 'AS' | 'IND_AS' | 'IFRS' | 'IFRS_SME'
 * @param {string[]} noteGroupIds   — unique IDs from FS generation (no __MANDATORY__ ones)
 * @returns {Map<string, number>}   — noteGroupId → noteNumber
 */
function assignNoteNumbers(method, noteGroupIds) {
  const mandatory = MANDATORY_NOTES[method] || MANDATORY_NOTES['AS'];
  const startFrom = mandatory.length + 1;

  const result = new Map();

  // Add mandatory notes first
  for (const m of mandatory) {
    result.set(m.noteGroupId, m.noteNumber);
  }

  // Assign sequential numbers to data note groups
  // Filter out any that accidentally match mandatory IDs
  const mandatoryIds = new Set(mandatory.map(m => m.noteGroupId));
  const dataNoteGroups = noteGroupIds.filter(id => id && !mandatoryIds.has(id));

  let counter = startFrom;
  for (const id of dataNoteGroups) {
    if (!result.has(id)) {
      result.set(id, counter++);
    }
  }

  return result;
}

/**
 * Get the mandatory note definitions for a method
 */
function getMandatoryNotes(method) {
  return MANDATORY_NOTES[method] || MANDATORY_NOTES['AS'];
}

module.exports = { assignNoteNumbers, getMandatoryNotes };
