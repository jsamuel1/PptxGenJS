/**
 * PptxGenJS — Syntax-Highlighted Code utility (docs/features/feature-syntax-highlighted-code.md)
 *
 * Dependency-free regex tokenizer + text-run builder for rendering source code on slides.
 * Import from `@jsamuel1/pptxgenjs/utils`.
 */
import type { TextProps } from '../core-interfaces'

export type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator' | 'plain'

export interface CodeRunsOptions {
	lang?: string
	theme?: Partial<Record<TokenKind, string>>
	lineNumbers?: boolean
	highlightLines?: number[]
	fontFace?: string
	fontSize?: number
}

const DEFAULT_THEME: Record<TokenKind, string> = {
	keyword: 'F92672',
	string: 'E6DB74',
	comment: '75715E',
	number: 'AE81FF',
	function: 'A6E22E',
	operator: 'F8F8F2',
	plain: 'F8F8F2',
}

const JS_KEYWORDS = new Set([
	'abstract', 'async', 'await', 'boolean', 'break', 'case', 'catch', 'class', 'const',
	'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
	'false', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import', 'in',
	'instanceof', 'interface', 'let', 'new', 'null', 'of', 'package', 'private', 'protected',
	'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type',
	'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
])

const PYTHON_KEYWORDS = new Set([
	'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
	'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
	'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
	'True', 'try', 'while', 'with', 'yield',
])

const RUST_KEYWORDS = new Set([
	'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum',
	'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
	'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super',
	'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
])

const GO_KEYWORDS = new Set([
	'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough',
	'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range',
	'return', 'select', 'struct', 'switch', 'type', 'var',
])

const JAVA_KEYWORDS = new Set([
	'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
	'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false',
	'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int',
	'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public',
	'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
	'throw', 'throws', 'transient', 'true', 'try', 'void', 'volatile', 'while',
])

const CSS_KEYWORDS = new Set([
	'inherit', 'initial', 'unset', 'revert', 'important', 'none', 'auto', 'block', 'flex',
	'grid', 'inline', 'relative', 'absolute', 'fixed', 'sticky', 'static', 'hidden',
	'visible', 'solid', 'dashed', 'dotted', 'transparent', 'currentColor',
])

const SQL_KEYWORDS = new Set([
	'select', 'from', 'where', 'insert', 'into', 'update', 'delete', 'create', 'drop',
	'alter', 'table', 'index', 'view', 'join', 'inner', 'outer', 'left', 'right', 'on',
	'and', 'or', 'not', 'in', 'is', 'null', 'as', 'order', 'by', 'group', 'having',
	'limit', 'offset', 'union', 'all', 'distinct', 'set', 'values', 'primary', 'key',
	'foreign', 'references', 'constraint', 'default', 'true', 'false', 'exists', 'between',
	'like', 'case', 'when', 'then', 'else', 'end', 'count', 'sum', 'avg', 'min', 'max',
])

const BASH_KEYWORDS = new Set([
	'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
	'in', 'function', 'return', 'local', 'export', 'readonly', 'declare', 'unset', 'shift',
	'exit', 'break', 'continue', 'true', 'false', 'source',
])

const LANG_MAP: Record<string, Set<string>> = {
	javascript: JS_KEYWORDS, js: JS_KEYWORDS, typescript: JS_KEYWORDS, ts: JS_KEYWORDS, jsx: JS_KEYWORDS, tsx: JS_KEYWORDS,
	python: PYTHON_KEYWORDS, py: PYTHON_KEYWORDS,
	rust: RUST_KEYWORDS, rs: RUST_KEYWORDS,
	go: GO_KEYWORDS, golang: GO_KEYWORDS,
	java: JAVA_KEYWORDS, kotlin: JAVA_KEYWORDS, kt: JAVA_KEYWORDS,
	css: CSS_KEYWORDS, scss: CSS_KEYWORDS, less: CSS_KEYWORDS,
	sql: SQL_KEYWORDS, mysql: SQL_KEYWORDS, postgres: SQL_KEYWORDS, postgresql: SQL_KEYWORDS,
	bash: BASH_KEYWORDS, shell: BASH_KEYWORDS, sh: BASH_KEYWORDS, zsh: BASH_KEYWORDS,
}

/** Resolve the keyword set for a language identifier. Defaults to JS. */
function keywordsFor(lang?: string): Set<string> {
	if (!lang) return JS_KEYWORDS
	return LANG_MAP[lang.toLowerCase()] ?? JS_KEYWORDS
}

// Pattern order matters: earlier patterns take priority
// Groups: 1=comment, 2=string, 3=number, 4=ident, 5=operator, 6=ws, 7=nl
const TOKEN_REGEX = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_$][a-zA-Z0-9_$]*)|([+\-*/%=<>!&|^~?:;,.{}[\]()]+)|([ \t]+)|(\n)/g

/**
 * Tokenize source code into classified spans. Dependency-free, regex-based.
 */
export function tokenizeCode(source: string, lang?: string): Array<{ text: string; token: TokenKind }> {
	if (!source) return []

	const keywords = keywordsFor(lang)
	const tokens: Array<{ text: string; token: TokenKind }> = []
	let match: RegExpExecArray | null
	TOKEN_REGEX.lastIndex = 0

	while ((match = TOKEN_REGEX.exec(source)) !== null) {
		const text = match[0]
		if (match[1]) {
			tokens.push({ text, token: 'comment' })
		} else if (match[2]) {
			tokens.push({ text, token: 'string' })
		} else if (match[3]) {
			tokens.push({ text, token: 'number' })
		} else if (match[4]) {
			const after = source.slice(TOKEN_REGEX.lastIndex)
			if (/^\s*\(/.test(after) && !keywords.has(text)) {
				tokens.push({ text, token: 'function' })
			} else if (keywords.has(text)) {
				tokens.push({ text, token: 'keyword' })
			} else {
				tokens.push({ text, token: 'plain' })
			}
		} else if (match[5]) {
			tokens.push({ text, token: 'operator' })
		} else if (match[6]) {
			tokens.push({ text, token: 'plain' })
		} else if (match[7]) {
			tokens.push({ text: '\n', token: 'plain' })
		}
	}
	return tokens
}

/**
 * Convert source code into PptxGenJS TextProps runs with syntax colouring.
 */
export function codeRuns(source: string, opts?: CodeRunsOptions): TextProps[] {
	if (!source) return []

	const theme = { ...DEFAULT_THEME, ...opts?.theme }
	const fontFace = opts?.fontFace ?? 'Courier New'
	const fontSize = opts?.fontSize ?? 12
	const highlightSet = opts?.highlightLines ? new Set(opts.highlightLines) : null
	const showLineNumbers = opts?.lineNumbers ?? false

	const lines = source.split('\n')
	const runs: TextProps[] = []
	const lineNumWidth = showLineNumbers ? String(lines.length).length : 0

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1
		const isDimmed = highlightSet !== null && !highlightSet.has(lineNum)

		if (showLineNumbers) {
			const numText = String(lineNum).padStart(lineNumWidth) + '  '
			runs.push({ text: numText, options: { color: '555555', fontFace, fontSize } })
		}

		const lineTokens = tokenizeCode(lines[i], opts?.lang)

		if (lineTokens.length === 0) {
			// Empty line — emit a break
			runs.push({ text: '', options: { fontFace, fontSize, color: theme.plain, breakLine: true } })
		} else {
			for (let t = 0; t < lineTokens.length; t++) {
				const tk = lineTokens[t]
				const color = isDimmed ? '555555' : theme[tk.token]
				const isLast = t === lineTokens.length - 1
				runs.push({
					text: tk.text,
					options: { color, fontFace, fontSize, ...(isLast ? { breakLine: true } : {}) },
				})
			}
		}
	}

	return runs
}
