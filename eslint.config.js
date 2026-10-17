import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-empty': 'warn',
      'no-console': 'off',
      'no-useless-assignment': 'error',
      'no-loss-of-precision': 'error',
      'no-unreachable': 'error',
      'preserve-caught-error': 'error',
    },
  },
  {
    // uni-app 条件编译 (#ifdef/#ifndef) 会在 AST 中产生多分支 return，对单环境解析为不可达代码属于假阳性
    files: [
      'src/utils/request.ts',
      'src/utils/image.ts',
      'src/utils/amap.ts',
      'src/components/app-icon/app-icon.vue',
      'src/uni_modules/**/*.{vue,ts,js}',
    ],
    rules: {
      'no-unreachable': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'unpackage/**'],
  },
]
