// Steam's text VDF/ACF subset. No evaluation or shell interpolation.
function parseValveKeyValues(text) {
  if (typeof text !== 'string' || text.length > 1024 * 1024) {
    throw new Error('Steam metadata is too large or invalid');
  }
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c) || c === '\uFEFF') {
      i++;
      continue;
    }
    if (text.slice(i, i + 2) === '//') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '{' || c === '}') {
      tokens.push({ brace: c });
      i++;
      continue;
    }
    let value = '';
    if (c === '"') {
      i++;
      let closed = false;
      while (i < text.length) {
        const next = text[i++];
        if (next === '"') {
          closed = true;
          break;
        }
        if (next === '\\') {
          const escaped = text[i++];
          if (escaped === undefined)
            throw new Error('Unterminated Steam string');
          value +=
            escaped === '\\' || escaped === '"' ? escaped : '\\' + escaped;
        } else value += next;
      }
      if (!closed) throw new Error('Unterminated Steam string');
    } else {
      while (i < text.length && !/[\s{}"]/.test(text[i])) value += text[i++];
      if (!value) throw new Error('Invalid Steam token');
    }
    tokens.push({ value });
  }
  let cursor = 0;
  function object(depth, nested) {
    if (depth > 32) throw new Error('Steam metadata nesting is too deep');
    const result = Object.create(null);
    while (cursor < tokens.length) {
      const key = tokens[cursor++];
      if (key.brace === '}' && nested) return result;
      if (key.value === undefined) throw new Error('Invalid Steam key');
      const token = tokens[cursor++];
      if (!token || token.brace === '}') throw new Error('Missing Steam value');
      if (Object.hasOwn(result, key.value))
        throw new Error('Duplicate Steam key');
      result[key.value] =
        token.brace === '{' ? object(depth + 1, true) : token.value;
    }
    if (nested) throw new Error('Unclosed Steam object');
    return result;
  }
  return object(0, false);
}

module.exports = { parseValveKeyValues };
