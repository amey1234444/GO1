'use strict';
// A deliberately small Markdown subset. Never interpret model output as HTML,
// load images, or create links; untrusted markup stays visible text.
(function(root) {
  function blocks(source) {
    const result = []; let code = null;
    for (const line of String(source).slice(0, 200000).split('\n')) {
      if (/^\s*```/.test(line)) {
        if (code !== null) { result.push({ tag: 'pre', text: code.join('\n') }); code = null; }
        else code = [];
      } else if (code !== null) code.push(line);
      else if (/^#{1,4}\s/.test(line)) result.push({ tag: 'h3', text: line.replace(/^#{1,4}\s+/, '') });
      else if (/^\s*[-*]\s/.test(line)) result.push({ tag: 'li', text: line.replace(/^\s*[-*]\s+/, '') });
      else if (line.trim()) result.push({ tag: 'p', text: line });
    }
    if (code !== null) result.push({ tag: 'pre', text: code.join('\n') });
    return result;
  }
  function render(element, source) {
    const doc = element.ownerDocument, fragment = doc.createDocumentFragment(); let list;
    for (const block of blocks(source)) {
      const item = doc.createElement(block.tag);
      if (block.tag === 'pre') { const code = doc.createElement('code'); code.textContent = block.text; item.append(code); }
      else {
        for (const part of block.text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)) {
          if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('`') && part.endsWith('`'))) {
            const bold = part.startsWith('**'), span = doc.createElement(bold ? 'strong' : 'code'); span.textContent = part.slice(bold ? 2 : 1, bold ? -2 : -1); item.append(span);
          } else item.append(doc.createTextNode(part));
        }
      }
      if (block.tag === 'li') { if (!list) { list = doc.createElement('ul'); fragment.append(list); } list.append(item); }
      else { list = null; fragment.append(item); }
    }
    element.classList.add('rich-answer'); element.replaceChildren(fragment);
  }
  const api = { blocks, render };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GO1RichText = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
