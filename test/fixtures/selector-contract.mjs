import { parse } from 'acorn';
// This is a literal/constant selector tripwire, NOT a complete CSS or dataflow
// analyser. Parse JavaScript instead of mistaking Number.POSITIVE_INFINITY and
// bundled enum properties for selectors. Runtime DOM tests cover emitted rules.
export function bareHashedSelectorLiterals(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' }), matches = new Set();
  function constant(node) {
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'BinaryExpression' && node.operator === '+') { const a = constant(node.left), b = constant(node.right); if (a !== undefined && b !== undefined) return a + b; }
    if (node.type === 'TemplateLiteral') {
      let text = node.quasis[0].value.cooked; if (text === null) return;
      for (let i = 0; i < node.expressions.length; i++) { const value = constant(node.expressions[i]); if (value === undefined || node.quasis[i + 1].value.cooked === null) return; text += value + node.quasis[i + 1].value.cooked; }
      return text;
    }
  }
  const pending = [ast];
  while (pending.length) {
    const node = pending.pop(), text = constant(node);
    if (text !== undefined) for (const match of text.matchAll(/\.[a-zA-Z]{5,}_[a-zA-Z]+/g)) matches.add(match[0]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child && typeof child.type === 'string') pending.push(child); }
      else if (value && typeof value.type === 'string') pending.push(value);
    }
  }
  return [...matches].sort();
}
