import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(js.configs.recommended,...ts.configs.recommended,{files:['**/*.{ts,tsx,mjs}'],languageOptions:{globals:{process:'readonly',console:'readonly',URL:'readonly',setTimeout:'readonly',clearTimeout:'readonly',setInterval:'readonly',clearInterval:'readonly',window:'readonly',document:'readonly',navigator:'readonly',performance:'readonly',crypto:'readonly',fetch:'readonly',Image:'readonly',requestAnimationFrame:'readonly',cancelAnimationFrame:'readonly'}},rules:{'@typescript-eslint/no-explicit-any':'error'}});
