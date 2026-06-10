/**
 * PptxGenJS — Syntax-Highlighted Code utility (docs/feature-syntax-highlighted-code.md)
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

// Pattern order matters: earlier patterns take priority
// Groups: 1=comment, 2=string, 3=number, 4=ident, 5=operator, 6=ws, 7=nl
const TOKEN_REGEX = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_$][a-zA-Z0-9_$]*)|([+\-*/%=<>!&|^~?:;,.{}[\]()]+)|([ \t]+)|(\n)/g

/**
 * Tokenize source code into classified spans. Dependency-free, regex-based.
 */
export function tokenizeCode(source: string, lang?: string): Array<{ text: string; token: TokenKind }> {
	if (!source) return []

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
			if (/^\s*\(/.test(after) && !JS_KEYWORDS.has(text)) {
				tokens.push({ text, token: 'function' })
			} else if (JS_KEYWORDS.has(text)) {
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
