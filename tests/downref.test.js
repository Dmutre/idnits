import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { MODES } from '../lib/config/modes.mjs'
import { toContainError, ValidationWarning, ValidationError, ValidationComment } from '../lib/helpers/error.mjs'
import { baseXMLDoc, baseTXTDoc } from './fixtures/base-doc.mjs'
import { cloneDeep, set } from 'lodash-es'
import { validateDownrefs, validateInformativeReferences, validateNormativeReferences, validateUnclassifiedReferences, vlidateDraftReferences } from '../lib/modules/downref.mjs'
import fetchMock from 'jest-fetch-mock'

expect.extend({
  toContainError
})

beforeEach(() => {
  fetchMock.enableMocks()
})

afterEach(() => {
  fetchMock.resetMocks()
})

describe('validateDownrefs', () => {
  describe('TXT Document Type', () => {
    test('valid references with no downrefs', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', ['4086', '8141'])
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-quic-http-34', section: 'normative_references' }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('invalid downref for a draft', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-emu-aka-pfs-34', section: 'normative_references' }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.NORMAL })
      expect(result).toContainError('DOWNREF_DRAFT', ValidationError)
    })

    test('invalid downref for an RFC', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [{ value: '952', section: 'normative_section' }])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.NORMAL })
      expect(result).toContainError('DOWNREF_DRAFT', ValidationError)
    })

    test('FORGIVE_CHECKLIST mode returns warnings', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', ['1094'])
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-emu-aka-pfs', section: 'normative_references' }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.FORGIVE_CHECKLIST })
      expect(result).toContainError('DOWNREF_DRAFT', ValidationWarning)
    })
  })

  describe('XML Document Type', () => {
    test('valid XML references without downrefs', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'RFC4086' } }] },
        { reference: [{ _attr: { anchor: 'RFC8141' } }] }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('invalid XML downref for a draft', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'draft-ietf-emu-aka-pfs-34' } }] }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.NORMAL })
      expect(result).toContainError('DOWNREF_DRAFT', ValidationError)
    })

    test('FORGIVE_CHECKLIST mode returns warnings for XML', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'RFC4187' } }] },
        { reference: [{ _attr: { anchor: 'draft-ietf-quic-http-34' } }] }
      ])

      fetchMock.dontMockOnce()

      const result = await validateDownrefs(doc, { mode: MODES.FORGIVE_CHECKLIST })
      expect(result).toContainError('DOWNREF_DRAFT', ValidationWarning)
    })
  })
})

describe('validateNormativeReferences', () => {
  describe('TXT Document Type', () => {
    test('valid normative references', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'normative_references' },
        { value: '8141', subsection: 'normative_references' }
      ])

      fetchMock.mockResponse(JSON.stringify({ status: 'Proposed Standard', obsoleted_by: [] }))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('normative reference with undefined status', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'normative_references' }
      ])

      fetchMock.mockResponse(JSON.stringify({}))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationComment(
          'UNDEFINED_STATUS',
          'RFC 4086 does not have a defined status or could not be fetched.',
          { ref: 'https://www.rfc-editor.org/info/rfc4086' }
        )
      ])
    })

    test('normative reference with unknown status', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '8141', subsection: 'normative_references' }
      ])

      fetchMock.mockResponse(JSON.stringify({ status: 'Unknown Status', obsoleted_by: [] }))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationComment(
          'UNKNOWN_STATUS',
          'RFC 8141 has an unrecognized status: "Unknown Status".',
          { ref: 'https://www.rfc-editor.org/info/rfc8141' }
        )
      ])
    })

    test('unclassified reference to an obsolete RFC', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'unclassified_references' }
      ])

      fetchMock.mockResponse(
        JSON.stringify({ status: 'Proposed Standard', obsoleted_by: ['9000'] })
      )

      const result = await validateUnclassifiedReferences(doc, { mode: MODES.NORMAL })
      expect(result).toContainError('OBSOLETE_UNCLASSIFIED_REFERENCE', ValidationError)
    })

    test('FORGIVE_CHECKLIST mode for an obsolete unclassified RFC', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'unclassified_references' }
      ])

      fetchMock.mockResponse(
        JSON.stringify({ status: 'Proposed Standard', obsoleted_by: ['9000'] })
      )

      const result = await validateUnclassifiedReferences(doc, { mode: MODES.FORGIVE_CHECKLIST })
      expect(result).toContainError('OBSOLETE_UNCLASSIFIED_REFERENCE', ValidationWarning)
    })

    test('normative reference to an obsolete RFC', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'normative_references' }
      ])

      fetchMock.mockResponse(
        JSON.stringify({ status: 'Proposed Standard', obsoleted_by: ['9000'] })
      )

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toContainEqual(
        expect.objectContaining({
          name: 'OBSOLETE_DOCUMENT',
          message: expect.stringContaining('RFC 4086 is obsolete and has been replaced by: 9000.')
        })
      )
    })

    test('FORGIVE_CHECKLIST mode for an obsolete RFC', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionRfc', [
        { value: '4086', subsection: 'normative_references' }
      ])

      fetchMock.mockResponse(
        JSON.stringify({ status: 'Proposed Standard', obsoleted_by: ['9000'] })
      )

      const result = await validateNormativeReferences(doc, { mode: MODES.FORGIVE_CHECKLIST })
      expect(result).toContainEqual(
        expect.objectContaining({
          name: 'OBSOLETE_DOCUMENT',
          message: expect.stringContaining('RFC 4086 is obsolete and has been replaced by: 9000.')
        })
      )
    })
  })

  describe('XML Document Type', () => {
    test('valid normative references', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'RFC4086' } }] },
        { reference: [{ _attr: { anchor: 'RFC8141' } }] }
      ])

      fetchMock.mockResponse(JSON.stringify({ status: 'Proposed Standard', obsoleted_by: [] }))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('normative reference with undefined status', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'RFC4086' } }] }
      ])

      fetchMock.mockResponse(JSON.stringify({}))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationComment(
          'UNDEFINED_STATUS',
          'RFC 4086 does not have a defined status or could not be fetched.',
          { ref: 'https://www.rfc-editor.org/info/rfc4086' }
        )
      ])
    })

    test('normative reference with unknown status', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'RFC8141' } }] }
      ])

      fetchMock.mockResponse(JSON.stringify({ status: 'Unknown Status', obsoleted_by: [] }))

      const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationComment(
          'UNKNOWN_STATUS',
          'RFC 8141 has an unrecognized status: "Unknown Status".',
          { ref: 'https://www.rfc-editor.org/info/rfc8141' }
        )
      ])
    })
  })

  test('normative reference to an obsolete RFC in XML', async () => {
    const doc = cloneDeep(baseXMLDoc)
    set(doc, 'data.rfc.back.references.references', [
      { reference: [{ _attr: { anchor: 'RFC4086' } }] }
    ])

    fetchMock.mockResponse(
      JSON.stringify({ status: 'Proposed Standard', obsoleted_by: ['9000'] })
    )

    const result = await validateNormativeReferences(doc, { mode: MODES.NORMAL })
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'OBSOLETE_DOCUMENT',
        message: expect.stringContaining('RFC 4086 is obsolete and has been replaced by: 9000.')
      })
    )
  })
})

describe('validateInformativeReferences', () => {
  test('valid informative references', async () => {
    const doc = cloneDeep(baseTXTDoc)
    set(doc, 'data.extractedElements.referenceSectionRfc', [
      { value: '4086', subsection: 'informative_references' },
      { value: '8141', subsection: 'informative_references' }
    ])

    fetchMock.mockResponse(JSON.stringify({ status: 'Informational', obsoleted_by: [] }))

    const result = await validateInformativeReferences(doc, { mode: MODES.NORMAL })
    expect(result).toHaveLength(0)
  })

  test('informative reference with undefined status', async () => {
    const doc = cloneDeep(baseTXTDoc)
    set(doc, 'data.extractedElements.referenceSectionRfc', [
      { value: '4086', subsection: 'informative_references' }
    ])

    fetchMock.mockResponse(JSON.stringify({}))

    const result = await validateInformativeReferences(doc, { mode: MODES.NORMAL })
    expect(result).toEqual([
      new ValidationComment(
        'UNDEFINED_STATUS',
        'The informative reference RFC 4086 does not have a defined status or could not be fetched.',
        { ref: 'https://www.rfc-editor.org/info/rfc4086' }
      )
    ])
  })

  test('informative reference to an obsolete RFC', async () => {
    const doc = cloneDeep(baseTXTDoc)
    set(doc, 'data.extractedElements.referenceSectionRfc', [
      { value: '4086', subsection: 'informative_references' }
    ])

    fetchMock.mockResponse(
      JSON.stringify({ status: 'Informational', obsoleted_by: ['9000'] })
    )

    const result = await validateInformativeReferences(doc, { mode: MODES.NORMAL })
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'OBSOLETE_INFORMATIVE_REFERENCE',
        message: expect.stringContaining('The informative reference RFC 4086 is obsolete and has been replaced by: 9000.')
      })
    )
  })

  test('FORGIVE_CHECKLIST mode for an obsolete informative RFC', async () => {
    const doc = cloneDeep(baseTXTDoc)
    set(doc, 'data.extractedElements.referenceSectionRfc', [
      { value: '4086', subsection: 'informative_references' }
    ])

    fetchMock.mockResponse(
      JSON.stringify({ status: 'Informational', obsoleted_by: ['9000'] })
    )

    const result = await validateInformativeReferences(doc, { mode: MODES.FORGIVE_CHECKLIST })
    expect(result).toContainEqual(
      expect.objectContaining({
        name: 'OBSOLETE_INFORMATIVE_REFERENCE',
        message: expect.stringContaining('The informative reference RFC 4086 is obsolete and has been replaced by: 9000.')
      })
    )
  })
})

describe('vlidateDraftReferences', () => {
  describe('TXT Document Type', () => {
    test('should return no warnings for valid drafts with defined states', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-example-01' },
        { value: 'draft-ietf-example-02' }
      ])

      fetchMock.mockResponses(
        JSON.stringify({ state: 'Active' }),
        JSON.stringify({ state: 'Active' })
      )

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('should return warning for drafts with undefined states', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-undefined-state' }
      ])

      fetchMock.mockResponseOnce(JSON.stringify({}))

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationWarning(
          'UNDEFINED_STATE',
          'The draft reference draft-ietf-undefined-state does not have a defined state or could not be fetched.',
          { ref: 'https://datatracker.ietf.org/doc/draft-ietf-undefined-state' }
        )
      ])
    })

    test('should return warning for drafts published as RFCs', async () => {
      const doc = cloneDeep(baseTXTDoc)
      set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
        { value: 'draft-ietf-published-as-rfc' }
      ])

      fetchMock.mockResponseOnce(JSON.stringify({ state: 'RFC' }))

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationWarning(
          'INVALID_STATE_FOR_DRAFT',
          'The draft reference draft-ietf-published-as-rfc is already published as an RFC and should not be referenced as a draft.',
          { ref: 'https://datatracker.ietf.org/doc/draft-ietf-published-as-rfc' }
        )
      ])
    })
  })

  describe('XML Document Type', () => {
    test('should return no warnings for valid XML draft references', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'draft-ietf-example-01' } }] },
        { reference: [{ _attr: { anchor: 'draft-ietf-example-02' } }] }
      ])

      fetchMock.mockResponses(
        JSON.stringify({ state: 'Active' }),
        JSON.stringify({ state: 'Active' })
      )

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toHaveLength(0)
    })

    test('should return warning for XML drafts with undefined states', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'draft-ietf-undefined-state' } }] }
      ])

      fetchMock.mockResponseOnce(JSON.stringify({}))

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationWarning(
          'UNDEFINED_STATE',
          'The draft reference draft-ietf-undefined-state does not have a defined state or could not be fetched.',
          { ref: 'https://datatracker.ietf.org/doc/draft-ietf-undefined-state' }
        )
      ])
    })

    test('should return warning for XML drafts published as RFCs', async () => {
      const doc = cloneDeep(baseXMLDoc)
      set(doc, 'data.rfc.back.references.references', [
        { reference: [{ _attr: { anchor: 'draft-ietf-published-as-rfc' } }] }
      ])

      fetchMock.mockResponseOnce(JSON.stringify({ state: 'RFC' }))

      const result = await vlidateDraftReferences(doc, { mode: MODES.NORMAL })
      expect(result).toEqual([
        new ValidationWarning(
          'INVALID_STATE_FOR_DRAFT',
          'The draft reference draft-ietf-published-as-rfc is already published as an RFC and should not be referenced as a draft.',
          { ref: 'https://datatracker.ietf.org/doc/draft-ietf-published-as-rfc' }
        )
      ])
    })
  })

  test('should return no warnings in SUBMISSION mode', async () => {
    const doc = cloneDeep(baseTXTDoc)
    set(doc, 'data.extractedElements.referenceSectionDraftReferences', [
      { value: 'draft-ietf-example-01' }
    ])

    const result = await vlidateDraftReferences(doc, { mode: MODES.SUBMISSION })
    expect(result).toHaveLength(0)
  })
})
