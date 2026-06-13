import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
	{
		// Lint only hand-written source. Everything below is generated build
		// output, third-party, or non-source and must not be linted (linting it
		// produced thousands of false positives because tsc/rollup emit
		// space-indented, double-quoted, semicolon-terminated code).
		ignores: [
			'src/bld/**', // tsc/rollup output (compiled .js + emitted .d.ts)
			'src/icons-fa.generated.ts', // auto-generated from Font Awesome source; not hand-written
			'dist/**', // shipped bundles
			'types/**', // published type declarations
			'out/**', // tsc declarationDir
			'demos/**', // example apps (own style)
			'website/**', // docs site (own toolchain)
			'test/**', // test fixtures/harness (own style)
			'tools/**', // build/validator scripts
			'**/*.d.ts', // any declaration file, wherever it lands
		],
	},
	{
		plugins: {
			'@stylistic': stylistic
		},
		files: ['src/**/*.ts'],
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommended
		],
		rules: {
			// --- Established formatting style (tabs, single quotes, no semicolons) ---
			"@stylistic/comma-dangle": ["error", "only-multiline"],
			"@stylistic/indent": ["error", "tab", { "SwitchCase": 1, "ImportDeclaration": 1 }],
			"@stylistic/no-tabs": ["error", { allowIndentationTabs: true }],
			"@stylistic/quotes": ["error", "single", { avoidEscape: true, allowTemplateLiterals: true }],
			"@stylistic/semi": ["error", "never"],
			"no-lone-blocks": 0,

			// --- Match this codebase's deliberate patterns ---
			// Allow intentionally-unused args/vars when prefixed with `_`
			// (standard convention; lets positional params stay in a signature).
			"@typescript-eslint/no-unused-vars": ["error", {
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			}],
			// `any` is used intentionally in XML-generation hot paths; the project
			// also sets `noImplicitAny: false`. Warn (don't error) so new uses are
			// visible without failing on the existing, deliberate ones.
			"@typescript-eslint/no-explicit-any": "warn",
			// The codebase frequently declares-then-assigns-in-branches and keeps
			// trailing assignments for readability. ESLint 10's recommended set
			// added this rule; it flags intentional style here, so downgrade to warn.
			"no-useless-assignment": "warn",
			// ESLint 10 added this; the codebase rethrows without `cause` in a few
			// spots intentionally. Warn rather than block.
			"preserve-caught-error": "warn",
		},
	}
);

/*
export  defineConfig([
	{
		files: ["src/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: ['./tsconfig.json'],  // enables “typed” rules
			},
		},
		...tseslint.configs.recommendedTypeChecked[0],  // base + type‑aware rules
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "warn",
			"@typescript-eslint/indent": ["error", "tab"],
			"@typescript-eslint/prefer-nullish-coalescing": 0, // "warn", too many items!
			"@typescript-eslint/restrict-plus-operands": "warn", // TODO: "error"
			"@typescript-eslint/restrict-template-expressions": "warn", // TODO: "error"
			"@typescript-eslint/strict-boolean-expressions": "off",
			"comma-dangle": ["error", "only-multiline"],
			"no-lone-blocks": 0,
			"no-tabs": ["error", { allowIndentationTabs: true }],
			indent: ["error", "tab", { "SwitchCase": 1, "ImportDeclaration": 1 }],
			quotes: ["error", "single"],
			semi: ["error", "never"],
		},
	},
]);
*/

/*
module.exports = {
	env: {
		browser: true,
		es2021: true,
		node: true,
	},
	extends: [
		"plugin:react/recommended",
		"standard-with-typescript",
		"plugin:@typescript-eslint/recommended",
	],
	overrides: [],
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
		project: ["./tsconfig.json"],
	},
	plugins: ["react", "@typescript-eslint"],
	ignorePatterns: [".eslintrc.js", "*.mjs", "demos/*", "index.d.ts", "gulpfile.js"],
	rules: {
		"@typescript-eslint/indent": ["error", "tab"],
		"@typescript-eslint/prefer-nullish-coalescing": 0, // "warn", too many items!
		"@typescript-eslint/restrict-plus-operands": "warn", // TODO: "error"
		"@typescript-eslint/restrict-template-expressions": "warn", // TODO: "error"
		"@typescript-eslint/strict-boolean-expressions": 0,
		"comma-dangle": ["error", "only-multiline"],
		"no-lone-blocks": 0,
		"no-tabs": ["error", { allowIndentationTabs: true }],
		indent: ["error", "tab", { "SwitchCase": 1, "ImportDeclaration": 1 }],
		quotes: ["error", "single"],
		semi: ["error", "never"],
	},
};
*/
