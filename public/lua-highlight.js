const keywords = new Set('and break do else elseif end for function goto if in local not or repeat return then until while'.split(' '));
const literals = new Set(['true', 'false', 'nil']);
const builtins = new Set('assert error ipairs next pairs pcall print require select tonumber tostring type unpack warn xpcall loadstring math string table coroutine utf8 bit32 os game workspace script shared Enum Instance Vector2 Vector3 CFrame Color3 UDim UDim2 task wait spawn delay'.split(' '));

export function tokenizeLua(source) {
  const pattern = /(--\[(=*)\[[\s\S]*?(?:\]\2\]|$)|--[^\r\n]*)|(\[(=*)\[[\s\S]*?(?:\]\4\]|$)|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)')|\b(0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
  const tokens = [];
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset) tokens.push({ text: source.slice(offset, match.index), type: null });
    const text = match[0];
    let type = null;
    if (match[1]) type = 'comment';
    else if (match[3]) type = 'string';
    else if (match[5]) type = 'number';
    else if (keywords.has(text)) type = 'keyword';
    else if (literals.has(text)) type = 'literal';
    else if (builtins.has(text)) type = 'builtin';
    else if (/^\s*\(/.test(source.slice(match.index + text.length))) type = 'function';
    tokens.push({ text, type });
    offset = match.index + text.length;
  }
  if (offset < source.length) tokens.push({ text: source.slice(offset), type: null });
  return tokens;
}
