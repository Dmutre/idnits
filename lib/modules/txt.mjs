import { ValidationError, ValidationWarning } from '../helpers/error.mjs'
import { MODES } from '../config/modes.mjs'
import { fetchRemoteDocInfoJson, fetchRemoteRfcInfo } from '../helpers/remote.mjs'

/**
 * Validate a document for over-long lines
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validateLineLength (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  let idx = 1
  let longestLineNum = 0
  let longestLineLength = 72
  for (const line of doc.body.split('\n')) {
    if (line.length > longestLineLength) {
      longestLineNum = idx
      longestLineLength = line.length
    }
    idx++
  }

  if (longestLineNum > 0) {
    if (mode === MODES.NORMAL) {
      result.push(new ValidationError('LINE_TOO_LONG', 'The document contains over-long lines of more than 72 characters.', {
        lines: [{ line: longestLineNum, pos: longestLineLength }],
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
    } else {
      result.push(new ValidationWarning('LINE_TOO_LONG', 'The document contains over-long lines of more than 72 characters.', {
        lines: [{ line: longestLineNum, pos: longestLineLength }],
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
    }
  }

  return result
}

/**
 * Validate a document comments that are out of code blocks
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validateCodeComments (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  const outOfBlockInlineComments = doc.data.possibleIssues.inlineCode

  if (doc.data.possibleIssues.inlineCode.length > 0) {
    result.push(new ValidationWarning('COMMENT_OUT_OF_CODE_BLOCK', 'Found something which looks like a code comment -- if you have code sections in the document, please surround them with \'<CODE BEGINS>\' and \'<CODE ENDS>\' lines.', {
      lines: outOfBlockInlineComments.map((obj) => ({ line: obj.line, pos: obj.pos })),
      ref: 'https://datatracker.ietf.org/doc/rfc8879'
    }))
  }

  return result
}

/**
 * Validate if Updates or Obsoletes line on first page has more than just numbers of RFCs
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validateUpdatesAndObsoletesLines (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) return result

  if (doc.data.possibleIssues.updatesRfcWithLetter.length) {
    result.push(new ValidationWarning(
      'UPDATE_CONTAINS_INVALID_CHARACTERS',
      `"Updates" line contains invalid characters: ${doc.data.possibleIssues.updatesRfcWithLetter}`,
      {
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
  }

  if (doc.data.possibleIssues.obsoletesWithLetter.length) {
    result.push(new ValidationWarning(
      'OBSOLETES_CONTAINS_INVALID_CHARACTERS',
      `"Obsoletes" line contains invalid characters: ${doc.data.possibleIssues.obsoletesWithLetter}`,
      {
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
  }

  return result
}

/**
 * Validate a document for over-long lines
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validateLineExtraSpacing (doc, { mode = MODES.NORMAL } = {}) {
  const result = []
  const MAX_DOCUMENT_LINE_WITH_SPACES = 50

  if (doc.data.possibleIssues.linesWithSpaces.length > MAX_DOCUMENT_LINE_WITH_SPACES) {
    if (mode === MODES.NORMAL) {
      result.push(new ValidationError('RAGGED_RIGHT', 'The document does not appear to be ragged-right (more than 50 lines of intra-line extra spacing).', {
        lines: doc.data.possibleIssues.linesWithSpaces.map((obj) => obj),
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
    } else if (mode === MODES.FORGIVE_CHECKLIST) {
      result.push(new ValidationWarning('RAGGED_RIGHT', 'The document does not appear to be ragged-right (more than 50 lines of intra-line extra spacing).', {
        lines: doc.data.possibleIssues.linesWithSpaces.map((obj) => obj),
        ref: 'https://authors.ietf.org/en/drafting-in-plaintext#checklist'
      }))
    }
  }

  return result
}

/**
 * Validate if all detected code blocks contain a license declaration
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validateCodeBlockLicenses (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) return result

  if (doc.data.contains.codeBlocks && !doc.data.contains.revisedBsdLicense) {
    result.push(new ValidationWarning(
      'CODE_BLOCK_MISSING_LICENSE',
      'A code-block is detected, but the document does not contain a license declaration.',
      {
        ref: 'https://trustee.ietf.org/license-info'
      }))
  }

  return result
}

/**
 * The 'RFC 5378 fix' announced around 5 Feb 2009 means that drafts first submitted before 10 Nov 2008 with a high probability should have an additional boilerplate paragraph excempting it from full 5378 compliance.
 * On the other hand, a draft first submitted on or after 10 Nov 2008 should probably not have such a paragraph.
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors/warnings/comments or empty if fully valid
 */
export async function validatePre5378Documents (doc, { mode = MODES.NORMAL } = {}) {
  const result = []
  const rfcDocumentNumber = 5378

  const updatesAndObsoletesRfc = [...doc.data.extractedElements.updatesRfc, ...doc.data.extractedElements.obsoletesRfc]

  if (!updatesAndObsoletesRfc.length) return result

  const invalidRfcNumbers = updatesAndObsoletesRfc.filter(num => Number(num) <= rfcDocumentNumber)

  if (invalidRfcNumbers.length && !doc.data.contains.licencse6_b_iii) {
    for (const rfcNumber of invalidRfcNumbers) {
      if (doc.data.extractedElements.obsoletesRfc.includes(rfcNumber)) {
        result.push(new ValidationWarning(
          'OBSOLETED_RFC_NOT_VALID',
            `The document obsoletes disallowed RFC${rfcNumber}`,
            {
              ref: 'https://trustee.ietf.org/wp-content/uploads/IETF-TLP-4.pdf'
            }))
      } else {
        result.push(new ValidationWarning(
          'UPDATES_RFC_NOT_VALID',
            `The document updates disallowed RFC${rfcNumber}`,
            {
              ref: 'https://trustee.ietf.org/wp-content/uploads/IETF-TLP-4.pdf'
            }))
      }
    }
  }

  return result
}

/**
 * Validate document licence declarations
 *
 * @param {Object} doc Document to validate
 * @param {Object} [opts] Additional options
 * @param {number} [opts.mode=0] Validation mode to use
 * @returns {Array} List of errors or empty if fully valid
 */
export async function validateAnyPriorVersionIsPre5378 (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  const PRE_5378_DATE = new Date('2008-11-10')

  const docInfo = await fetchRemoteDocInfoJson(doc.slug)

  if (!docInfo || !docInfo.rev_history) return result

  const pre5378Versions = docInfo.rev_history.filter(version => new Date(version.published) < new Date(PRE_5378_DATE))

  if (pre5378Versions.length && !doc.data.contains.licencse6_c_iii) {
    result.push(new ValidationWarning(
      'PRIOR_VERSIONS_PRE_5378',
      'The document has prior versions that were submitted before 10 Nov 2008.',
      {
        ref: 'https://trustee.ietf.org/wp-content/uploads/IETF-TLP-4.pdf'
      }
    ))
  }

  return result
}
