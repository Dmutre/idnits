import { ValidationWarning, ValidationError, ValidationComment } from '../helpers/error.mjs'
import { checkReferencesInDownrefs } from '../remote/downref.mjs'
import { MODES } from '../config/modes.mjs'
import { extractDefinedReferences } from '../helpers/utils.mjs'
import { getStatusWeight } from '../config/rfc-status-hierarchy.mjs'
import { fetchRemoteRfcInfo, fetchRemoteDocInfoJson } from '../helpers/remote.mjs'

/**
 * Validate document references for RFCs and Drafts downrefs.
 *
 * @param {Object} doc - Document to validate
 * @param {Object} [opts] - Additional options
 * @param {number} [opts.mode=0] - Validation mode to use
 * @param {boolean} [opts.offline=false] - Skip fetching remote data if true
 * @returns {Array} - List of errors/warnings/comments
 */
export async function validateDownrefs (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) {
    return result
  }

  switch (doc.type) {
    case 'txt': {
      const { referenceSectionRfc, referenceSectionDraftReferences } = doc.data.extractedElements
      const rfcs = referenceSectionRfc.map((rfc) => `RFC ${rfc.value}`)
      const drafts = normalizeDraftReferences(referenceSectionDraftReferences.map((el) => el.value))
      const downrefMatches = await checkReferencesInDownrefs([...rfcs, ...drafts])

      downrefMatches.forEach((match) => {
        switch (mode) {
          case MODES.NORMAL: {
            result.push(new ValidationError('DOWNREF_DRAFT', `Draft ${match} is listed in the Downref Registry.`, {
              ref: `https://datatracker.ietf.org/doc/${match}`
            }))
            break
          }
          case MODES.FORGIVE_CHECKLIST: {
            result.push(new ValidationWarning('DOWNREF_DRAFT', `Draft ${match} is listed in the Downref Registry.`, {
              ref: `https://datatracker.ietf.org/doc/${match}`
            }))
            break
          }
        }
      })

      break
    }
    case 'xml': {
      const referencesSections = doc.data.rfc.back.references.references
      const definedReferences = extractDefinedReferences(referencesSections)
      const normilizedReferences = normalizeXmlReferences(definedReferences)

      const downrefMatches = await checkReferencesInDownrefs(normilizedReferences)

      downrefMatches.forEach((match) => {
        switch (mode) {
          case MODES.NORMAL: {
            result.push(new ValidationError('DOWNREF_DRAFT', `Draft ${match} is listed in the Downref Registry.`, {
              ref: `https://datatracker.ietf.org/doc/${match}`
            }))
            break
          }
          case MODES.FORGIVE_CHECKLIST: {
            result.push(new ValidationWarning('DOWNREF_DRAFT', `Draft ${match} is listed in the Downref Registry.`, {
              ref: `https://datatracker.ietf.org/doc/${match}`
            }))
            break
          }
        }
      })
      break
    }
  }

  return result
}

/**
 * Normalize references by removing brackets, versions, and checking for drafts.
 *
 * @param {Array} references - Array of textual references.
 * @returns {Array} - Array of normalized references containing "draft".
 */
function normalizeDraftReferences (references) {
  return references
    .map((ref) => {
      let normalized = ref.replace(/^\[|\]$/g, '')
      normalized = normalized.replace(/-\d{2}$/, '')

      return normalized
    })
    .filter((ref) => ref.toLowerCase().includes('draft'))
}

/**
 * Normalize XML references to drafts and RFCs.
 *
 * @param {Array} references - Array of reference strings.
 * @returns {Array} - Normalized references including only drafts and RFCs.
 */
function normalizeXmlReferences (references) {
  const normalizedReferences = []

  references.forEach((ref) => {
    if (/^RFC\d+$/i.test(ref)) {
      const rfcNumber = ref.match(/\d+/)[0]
      normalizedReferences.push(`RFC ${rfcNumber}`)
    } else if (/draft/i.test(ref)) {
      const draftName = ref.trim().replace(/^\[|\]$/g, '').replace(/-\d{2}$/, '')
      normalizedReferences.push(draftName)
    }
  })

  return normalizedReferences
}

/**
 * Validates normative references within a document by checking the status of referenced RFCs.
 *
 * This function processes both text (`txt`) and XML (`xml`) documents, identifying RFCs within
 * normative references and validating their status using remote data fetched from the RFC editor.
 *
 * - For TXT documents, it looks for normative references in the `referenceSectionRfc` field.
 * - For XML documents, it extracts references from the back references section.
 *
 * Steps:
 * 1. Extract normative references for both TXT and XML documents.
 * 2. Fetch metadata for each RFC using `fetchRemoteRfcInfo`.
 * 3. Validate the fetched status:
 *    - If no status is defined or the RFC cannot be fetched, a `UNDEFINED_STATUS` comment is added.
 *    - If the status is unrecognized, an `UNKNOWN_STATUS` comment is added.
 * 4. Return a list of validation comments highlighting issues.
 *
 * @param {Object} doc - The document to validate.
 * @param {Object} [opts] - Additional options.
 * @param {number} [opts.mode=MODES.NORMAL] - Validation mode (e.g., NORMAL, SUBMISSION).
 * @returns {Promise<Array>} - A list of validation results, including warnings or comments.
 */
export async function validateNormativeReferences (doc, { mode = MODES.NORMAL } = {}) {
  const result = []
  const RFC_NUMBER_REG = /^\d+$/

  if (mode === MODES.SUBMISSION) {
    return result
  }

  switch (doc.type) {
    case 'txt': {
      const normativeReferences = doc.data.extractedElements.referenceSectionRfc
        .filter((el) => el.subsection === 'normative_references' && RFC_NUMBER_REG.test(el.value))
        .map((el) => el.value)

      for (const rfcNum of normativeReferences) {
        const rfcInfo = await fetchRemoteRfcInfo(rfcNum)

        if (!rfcInfo || !rfcInfo.status) {
          result.push(new ValidationComment('UNDEFINED_STATUS', `RFC ${rfcNum} does not have a defined status or could not be fetched.`, {
            ref: `https://www.rfc-editor.org/info/rfc${rfcNum}`
          }))
          continue
        }

        const statusWeight = getStatusWeight(rfcInfo.status)

        if (statusWeight === null) {
          result.push(new ValidationComment('UNKNOWN_STATUS', `RFC ${rfcNum} has an unrecognized status: "${rfcInfo.status}".`, {
            ref: `https://www.rfc-editor.org/info/rfc${rfcNum}`
          }))
        }

        if (rfcInfo.obsoleted_by.length > 0) {
          const obsoletedByList = rfcInfo.obsoleted_by.join(', ')
          const message = `The referenced document RFC ${rfcNum} is obsolete and has been replaced by: ${obsoletedByList}.`

          if (mode === MODES.NORMAL) {
            result.push(new ValidationError(
              'OBSOLETE_DOCUMENT',
              message,
              {
                ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}`
              }
            ))
          } else if (mode === MODES.FORGIVE_CHECKLIST) {
            result.push(new ValidationWarning(
              'OBSOLETE_DOCUMENT',
              message,
              {
                ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}`
              }
            ))
          }
        }
      }
      break
    }
    case 'xml': {
      const referencesSections = doc.data.rfc.back.references.references
      const definedReferences = extractDefinedReferences(referencesSections)
      const normilizedReferences = normalizeXmlReferences(definedReferences)
        .filter((ref) => ref.startsWith('RFC'))
        .map((ref) => ref.match(/\d+/)[0])

      for (const rfcNum of normilizedReferences) {
        const rfcInfo = await fetchRemoteRfcInfo(rfcNum)

        if (!rfcInfo || !rfcInfo.status) {
          result.push(new ValidationComment('UNDEFINED_STATUS', `RFC ${rfcNum} does not have a defined status or could not be fetched.`, {
            ref: `https://www.rfc-editor.org/info/rfc${rfcNum}`
          }))
          continue
        }

        const statusWeight = getStatusWeight(rfcInfo.status)

        if (statusWeight === null) {
          result.push(new ValidationComment('UNKNOWN_STATUS', `RFC ${rfcNum} has an unrecognized status: "${rfcInfo.status}".`, {
            ref: `https://www.rfc-editor.org/info/rfc${rfcNum}`
          }))
        }

        if (rfcInfo.obsoleted_by.length > 0) {
          const obsoletedByList = rfcInfo.obsoleted_by.join(', ')
          const message = `The referenced document RFC ${rfcNum} is obsolete and has been replaced by: ${obsoletedByList}.`

          if (mode === MODES.NORMAL) {
            result.push(new ValidationError(
              'OBSOLETE_DOCUMENT',
              message,
              {
                ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}`
              }
            ))
          } else if (mode === MODES.FORGIVE_CHECKLIST) {
            result.push(new ValidationWarning(
              'OBSOLETE_DOCUMENT',
              message,
              {
                ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}`
              }
            ))
          }
        }
      }
      break
    }
  }

  return result
}

/**
 * Validates unclassified references within a document.
 *
 * This function checks for issues in unclassified references from the document's
 * extracted elements. Specifically, it identifies if:
 * 1. The reference is obsolete (i.e., replaced by other documents).
 * 2. The reference does not have a defined status or cannot be fetched.
 *
 * - For each unclassified reference, the function fetches its metadata using
 *   `fetchRemoteRfcInfo`.
 * - If the reference is obsolete, it generates a validation error or warning
 *   based on the provided mode.
 * - If the reference has no status or cannot be fetched, a validation comment is generated.
 *
 * Modes:
 * - `NORMAL`: Produces `ValidationError` for obsolete references.
 * - `FORGIVE_CHECKLIST`: Produces `ValidationWarning` for obsolete references.
 *
 * @param {Object} doc - The document object to validate.
 * @param {Object} [opts] - Additional options.
 * @param {number} [opts.mode=MODES.NORMAL] - Validation mode (`NORMAL` or `FORGIVE_CHECKLIST`).
 * @returns {Promise<Array>} - A list of validation results, including errors, warnings, or comments.
 *
 */
export async function validateUnclassifiedReferences (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) {
    return result
  }

  const unclassifiedReferences = doc.data.extractedElements.referenceSectionRfc
    .filter(el => el.subsection === 'unclassified_references')
    .map(el => el.value)

  for (const ref of unclassifiedReferences) {
    const rfcInfo = await fetchRemoteRfcInfo(ref)

    if (!rfcInfo || !rfcInfo.status) {
      result.push(new ValidationComment(
        'UNDEFINED_STATUS',
        `The unclassified reference ${ref} does not have a defined status or could not be fetched.`,
        { ref: `https://www.rfc-editor.org/info/rfc${ref}` }
      ))
      continue
    }

    if (rfcInfo.obsoleted_by.length > 0) {
      const obsoletedByList = rfcInfo.obsoleted_by.join(', ')
      const message = `The unclassified reference ${ref} is obsolete and has been replaced by: ${obsoletedByList}.`

      if (mode === MODES.NORMAL) {
        result.push(new ValidationError(
          'OBSOLETE_UNCLASSIFIED_REFERENCE',
          message,
          { ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}` }
        ))
      } else if (mode === MODES.FORGIVE_CHECKLIST) {
        result.push(new ValidationWarning(
          'OBSOLETE_UNCLASSIFIED_REFERENCE',
          message,
          { ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}` }
        ))
      }
    }
  }

  return result
}

/**
 * Validates informative references within a document.
 *
 * This function checks for issues in informative references from the document's
 * extracted elements. Specifically, it identifies if:
 * 1. The reference is obsolete (i.e., replaced by other documents).
 * 2. The reference does not have a defined status or cannot be fetched.
 *
 * - For each informative reference, the function fetches its metadata using
 *   `fetchRemoteRfcInfo`.
 * - If the reference is obsolete, it generates a validation error or warning
 *   based on the provided mode.
 * - If the reference has no status or cannot be fetched, a validation comment is generated.
 *
 * Modes:
 * - `NORMAL`: Produces `ValidationError` for obsolete references.
 * - `FORGIVE_CHECKLIST`: Produces `ValidationWarning` for obsolete references.
 *
 * @param {Object} doc - The document object to validate.
 * @param {Object} [opts] - Additional options.
 * @param {number} [opts.mode=MODES.NORMAL] - Validation mode (`NORMAL` or `FORGIVE_CHECKLIST`).
 * @returns {Promise<Array>} - A list of validation results, including errors, warnings, or comments.
 */
export async function validateInformativeReferences (doc, { mode = MODES.NORMAL } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) {
    return result
  }

  const informativeReferences = doc.data.extractedElements.referenceSectionRfc
    .filter(el => el.subsection === 'informative_references')
    .map(el => el.value)

  for (const ref of informativeReferences) {
    const rfcInfo = await fetchRemoteRfcInfo(ref)

    if (!rfcInfo || !rfcInfo.status) {
      result.push(new ValidationComment(
        'UNDEFINED_STATUS',
        `The informative reference RFC ${ref} does not have a defined status or could not be fetched.`,
        { ref: `https://www.rfc-editor.org/info/rfc${ref}` }
      ))
      continue
    }

    if (rfcInfo.obsoleted_by.length > 0) {
      const obsoletedByList = rfcInfo.obsoleted_by.join(', ')
      const message = `The informative reference RFC ${ref} is obsolete and has been replaced by: ${obsoletedByList}.`

      if (mode === MODES.NORMAL) {
        result.push(new ValidationError(
          'OBSOLETE_INFORMATIVE_REFERENCE',
          message,
          { ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}` }
        ))
      } else if (mode === MODES.FORGIVE_CHECKLIST) {
        result.push(new ValidationWarning(
          'OBSOLETE_INFORMATIVE_REFERENCE',
          message,
          { ref: `https://www.rfc-editor.org/info/rfc${rfcInfo.rfc}` }
        ))
      }
    }
  }

  return result
}

/**
 * Validate draft references in a document to ensure their states are valid.
 *
 * This function checks all draft references in a document, ensuring:
 * - The referenced draft exists and its state can be fetched.
 * - A draft is not already published as an RFC (and thus should not be referenced as a draft).
 *
 * For text documents (`txt`), the function inspects references extracted from the reference section.
 * For XML documents (`xml`), it parses the defined references and filters for drafts.
 *
 * @param {Object} doc - The document to validate. Should contain `type` and `data` properties.
 * @param {Object} [opts] - Additional options for validation.
 * @param {number} [opts.mode] - The validation mode (e.g., SUBMISSION mode skips validation).
 *
 * @returns {Array} A list of `ValidationWarning` objects containing information about invalid references.
 */

export async function vlidateDraftReferences (doc, { mode } = {}) {
  const result = []

  if (mode === MODES.SUBMISSION) {
    return result
  }

  switch (doc.type) {
    case 'txt': {
      const referenceSectionDraftReferences = doc.data.extractedElements.referenceSectionDraftReferences
      const drafts = normalizeDraftReferences(referenceSectionDraftReferences.map((el) => el.value))

      for (let i = 0; i < drafts.length; i++) {
        const draftInfo = await fetchRemoteDocInfoJson(drafts[i])

        if (!draftInfo || !draftInfo.state) {
          result.push(new ValidationWarning(
            'UNDEFINED_STATE',
            `The draft reference ${drafts[i]} does not have a defined state or could not be fetched.`,
            { ref: `https://datatracker.ietf.org/doc/${drafts[i]}` }
          ))
          continue
        } else if (draftInfo.state.toLowerCase() === 'rfc') {
          result.push(new ValidationWarning(
            'INVALID_STATE_FOR_DRAFT',
            `The draft reference ${drafts[i]} is already published as an RFC and should not be referenced as a draft.`,
            { ref: `https://datatracker.ietf.org/doc/${drafts[i]}` }
          ))
        }
      }
      break
    }
    case 'xml': {
      const referencesSections = doc.data.rfc.back.references.references
      const definedReferences = extractDefinedReferences(referencesSections)
      const normilizedReferences = normalizeXmlReferences(definedReferences)
      const drafts = normilizedReferences.filter((el) => el.startsWith('draft-'))

      for (let i = 0; i < drafts.length; i++) {
        const draftInfo = await fetchRemoteDocInfoJson(drafts[i])

        if (!draftInfo || !draftInfo.state) {
          result.push(new ValidationWarning(
            'UNDEFINED_STATE',
            `The draft reference ${drafts[i]} does not have a defined state or could not be fetched.`,
            { ref: `https://datatracker.ietf.org/doc/${drafts[i]}` }
          ))
          continue
        } else if (draftInfo.state.toLowerCase() === 'rfc') {
          result.push(new ValidationWarning(
            'INVALID_STATE_FOR_DRAFT',
            `The draft reference ${drafts[i]} is already published as an RFC and should not be referenced as a draft.`,
            { ref: `https://datatracker.ietf.org/doc/${drafts[i]}` }
          ))
        }
      }
      break
    }
  }

  return result
}
