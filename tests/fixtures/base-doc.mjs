export const baseTXTDoc = {
  type: 'txt',
  filename: '',
  body: '',
  slug: '',
  data: {
    pageCount: 1,
    header: {
      authors: [],
      date: null,
      source: null,
      expires: null,
      intendedStatus: null,
      category: null
    },
    content: {
      abstract: null,
      introduction: null,
      securityConsiderations: null,
      authorAddress: null,
      references: null,
      ianaConsiderations: null
    },
    title: null,
    slug: null,
    extractedElements: {
      copyrightDates: [],
      isPKorBM: null,
      fqdnDomains: [],
      ipv4: [],
      ipv6: [],
      keywords2119: [],
      boilerplate2119Keywords: [],
      obsoletesRfc: [],
      updatesRfc: [],
      nonReferenceSectionRfc: [],
      referenceSectionRfc: [],
      nonReferenceSectionDraftReferences: [],
      referenceSectionDraftReferences: [],
      bracketedRfcNonReferences: [],
      bracketedRfcReferences: [],
      licence6_b_ii: [],
      licence6_b_i: []
    },
    possibleIssues: {
      unexpectedIndentation: [],
      copyrightLines6_i: [],
      copyrightLicenses: [],
      paragraphPointingToTheListOfCurrentId: [],
      isTableOfContentsExists: null,
      updatesRfcWithLetter: [],
      obsoletesWithLetter: [],
      isAbstractNumbered: null,
      isCopyrightNoticeNumbered: null,
      isStatusOfThisMemoNumbered: null,
      linesWithSpaces: [],
      hyphenatedLines: [],
      inlineCode: [],
      misspeled2119Keywords: [],
      submissionCompliancePage: null,
      pageLineWithFormFeed: []
    },
    references: {
      rfc2119: false,
      rfc8174: false
    },
    contains: {
      draftParagraphOutSixMonthValidity: false,
      pagesFound: 0,
      submissionCompliance: false,
      acceptableParagraphNotingThatDraft: false,
      revisedBsdLicense6_i: false,
      codeBlocks: false,
      idIndication: false,
      licencse6_c_iii: false,
      copyrightSection6_b_i: false,
      copyrightLicenseValid: false
    }
  }
}

export const baseXMLDoc = {
  type: 'xml',
  filename: '',
  externalEntities: [],
  data: {
    rfc: { }
  }
}
