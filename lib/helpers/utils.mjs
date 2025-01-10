/**
 * Recursively extract all values of a specific tag and attribute from an XML document.
 *
 * This function traverses the XML document to find all elements matching the specified
 * tag name and extracts the values of the specified attribute.
 *
 * @param {Object} node The root node of the XML document to traverse.
 * @param {string} tagName The tag name to search for.
 * @param {string} attributeName The attribute to extract values from.
 * @param {Array<string>} [extractedValues=[]] An array to accumulate found attribute values.
 * @returns {Array<string>} An array of attribute values from matching tags.
 */
export function extractRecursiveByTagAndAttribute (node, tagName, attributeName, extractedValues = []) {
  if (node[tagName]) {
    const tags = Array.isArray(node[tagName]) ? node[tagName] : [node[tagName]]
    tags.forEach(tag => {
      if (tag._attr && tag._attr[attributeName]) {
        extractedValues.push(tag._attr[attributeName])
      }
    })
  }

  Object.keys(node).forEach(key => {
    if (typeof node[key] === 'object') {
      extractRecursiveByTagAndAttribute(node[key], tagName, attributeName, extractedValues)
    }
  })

  return extractedValues
}

/**
 * Extracts defined reference anchors from the provided reference sections.
 *
 * This function iterates over an array of reference sections, checking if each section
 * contains references and whether each reference has an anchor attribute. If an anchor
 * is found, it is added to the resulting list of defined references.
 *
 * @param {Array} referencesSections - An array of reference sections to process.
 * @returns {Array} - A list of extracted reference anchors.
 */
export function extractDefinedReferences (referencesSections) {
  const definedReferences = []

  referencesSections.forEach(section => {
    if (section.reference && Array.isArray(section.reference)) {
      section.reference.forEach(ref => {
        if (ref._attr && ref._attr.anchor) {
          definedReferences.push(ref._attr.anchor)
        }
      })
    }
  })

  return definedReferences
}
