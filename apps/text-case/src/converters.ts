// Split text into words, handling camelCase, PascalCase, snake_case, kebab-case, etc.
function splitWords(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABCDef -> ABC Def
    .replace(/[_\-./]/g, ' ') // separators to spaces
    .split(/\s+/)
    .filter(Boolean);
}

export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|\s|[-/])(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

export function toSentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
}

export function toCamelCase(text: string): string {
  const words = splitWords(text);
  if (words.length === 0) return '';
  return words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join('');
}

export function toPascalCase(text: string): string {
  const words = splitWords(text);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export function toSnakeCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toLowerCase())
    .join('_');
}

export function toKebabCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toLowerCase())
    .join('-');
}

export function toConstantCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toUpperCase())
    .join('_');
}

export function toDotCase(text: string): string {
  return splitWords(text)
    .map((w) => w.toLowerCase())
    .join('.');
}

export function toAlternatingCase(text: string): string {
  let upper = false;
  return text
    .split('')
    .map((c) => {
      if (/[a-zA-Z]/.test(c)) {
        upper = !upper;
        return upper ? c.toUpperCase() : c.toLowerCase();
      }
      return c;
    })
    .join('');
}

export function toReverse(text: string): string {
  return text.split('').reverse().join('');
}

export interface Conversion {
  id: string;
  label: string;
  fn: (text: string) => string;
  preview: string; // example output
}

export const CONVERSIONS: Conversion[] = [
  { id: 'upper', label: 'UPPERCASE', fn: toUpperCase, preview: 'HELLO WORLD' },
  { id: 'lower', label: 'lowercase', fn: toLowerCase, preview: 'hello world' },
  { id: 'title', label: 'Title Case', fn: toTitleCase, preview: 'Hello World' },
  { id: 'sentence', label: 'Sentence case', fn: toSentenceCase, preview: 'Hello world' },
  { id: 'camel', label: 'camelCase', fn: toCamelCase, preview: 'helloWorld' },
  { id: 'pascal', label: 'PascalCase', fn: toPascalCase, preview: 'HelloWorld' },
  { id: 'snake', label: 'snake_case', fn: toSnakeCase, preview: 'hello_world' },
  { id: 'kebab', label: 'kebab-case', fn: toKebabCase, preview: 'hello-world' },
  { id: 'constant', label: 'CONSTANT_CASE', fn: toConstantCase, preview: 'HELLO_WORLD' },
  { id: 'dot', label: 'dot.case', fn: toDotCase, preview: 'hello.world' },
  { id: 'alternating', label: 'aLtErNaTiNg', fn: toAlternatingCase, preview: 'hElLo WoRlD' },
  { id: 'reverse', label: 'Reverse', fn: toReverse, preview: 'dlrow olleH' },
];

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function countCharacters(text: string): number {
  return text.length;
}
