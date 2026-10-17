/**
 * 轻量 Markdown 行解析器（面向 AI 客服回复）
 *
 * 背景：后端 AI 回复是标准 Markdown（含 `### 标题`、`**粗体**`、`*斜体*`、
 * `` `行内代码` ``、`- 列表`、`> 引用`、`| 表格 |`）。移动端此前直接把原文塞进
 * `<text>`，于是一屏 `###`、`**`、`|` 全部裸露，观感极差。
 *
 * 这里把 Markdown 解析成**扁平行数组**，由模板一层 `v-for` 渲染：
 * 复杂度集中在 TS，模板只做两次循环（行 → 片段），避免在 .vue 里堆叠 v-if 森林。
 *
 * 支持的语法（覆盖 AI 实际输出）：
 * - `#` ~ `######` 标题（映射为 h1~h4 四级视觉）
 * - `**粗体**` / `*斜体*` / `` `行内代码` ``
 * - `-` `*` `+` 无序列表；`1.` 有序列表
 * - `>` 引用块
 * - ``` 围栏代码块
 * - `| a | b |` 表格（含 `|---|` 分隔行识别）
 * - `---` 分隔线
 */

/** 行内片段 */
export interface MdSeg {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

/** 渲染行 */
export interface MdLine {
  /** 样式类：md-h / md-h1..md-h4 / md-p / md-li / md-quote / md-hr / md-tr / md-code-block */
  cls: string
  /** 普通行的行内片段 */
  segs?: MdSeg[]
  /** 表格行：各单元格的行内片段 */
  cells?: MdSeg[][]
  /** 列表符号（• 或 1.） */
  bullet?: string
  /** 表格表头行标记 */
  header?: boolean
  /** 代码块原文 */
  raw?: string
}

/**
 * 行内标记的正则模式。
 *
 * ⚠️ 注意：**不能**把它编译成模块级的带 `g` 标志的正则实例 ——
 * `parseInline` 在解析粗体/斜体时会递归调用自身，而 `g` 正则的 `lastIndex`
 * 是实例级可变状态，递归会把它改掉，外层 `while (re.exec(...))` 于是永远回到开头，
 * 造成死循环（表现为页面卡死、截图超时）。因此每次调用都新建实例。
 */
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g

/** 解析行内标记，切分为带样式的片段（支持 `**粗体内有 `code`**` 这类嵌套） */
export function parseInline(text: string): MdSeg[] {
  if (!text) return []
  const segs: MdSeg[] = []
  // 每次调用新建正则实例，隔离 lastIndex
  const re = new RegExp(INLINE_PATTERN.source, 'g')
  let last = 0
  let matched: RegExpExecArray | null

  while ((matched = re.exec(text)) !== null) {
    if (matched.index > last) {
      segs.push({ text: text.slice(last, matched.index) })
    }
    const token = matched[0]
    if (token.startsWith('**')) {
      // 粗体内部可能还嵌着行内代码/斜体，递归解析后再统一叠加 bold，
      // 否则会出现 `**提货码：`PK09220271`**` 把反引号原样显示的问题
      parseInline(token.slice(2, -2)).forEach((inner) => segs.push({ ...inner, bold: true }))
    } else if (token.startsWith('`')) {
      segs.push({ text: token.slice(1, -1), code: true })
    } else {
      parseInline(token.slice(1, -1)).forEach((inner) => segs.push({ ...inner, italic: true }))
    }
    last = matched.index + token.length
  }

  if (last < text.length) {
    segs.push({ text: text.slice(last) })
  }
  return segs.length ? segs : [{ text }]
}

/** 表格分隔行：|---|:--:|---| */
function isTableDivider(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))
}

/** 主入口：Markdown 文本 → 行数组 */
export function parseMarkdownLines(src: string): MdLine[] {
  const lines: MdLine[] = []
  if (!src) return lines

  const raw = src.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let inCode = false
  let codeBuf: string[] = []

  while (i < raw.length) {
    const text = raw[i]
    const t = text.trim()

    // ---- 围栏代码块 ----
    if (t.startsWith('```')) {
      if (inCode) {
        lines.push({ cls: 'md-code-block', raw: codeBuf.join('\n') })
        codeBuf = []
        inCode = false
      } else {
        inCode = true
      }
      i++
      continue
    }
    if (inCode) {
      codeBuf.push(text)
      i++
      continue
    }

    // ---- 空行 ----
    if (!t) {
      i++
      continue
    }

    // ---- 分隔线 ----
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      lines.push({ cls: 'md-hr' })
      i++
      continue
    }

    // ---- 标题 ----
    const heading = /^(#{1,6})\s+(.*)$/.exec(t)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      lines.push({ cls: `md-h md-h${level}`, segs: parseInline(heading[2]) })
      i++
      continue
    }

    // ---- 表格 ----
    if (t.startsWith('|') && t.endsWith('|')) {
      const tableRows: string[][] = []
      while (i < raw.length && raw[i].trim().startsWith('|')) {
        const cells = raw[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
        if (!isTableDivider(cells)) {
          tableRows.push(cells)
        }
        i++
      }
      tableRows.forEach((cells, idx) => {
        lines.push({
          cls: 'md-tr' + (idx === 0 ? ' md-tr-head' : ''),
          cells: cells.map(parseInline),
          header: idx === 0
        })
      })
      continue
    }

    // ---- 引用 ----
    if (t.startsWith('>')) {
      lines.push({ cls: 'md-quote', segs: parseInline(t.replace(/^>\s?/, '')) })
      i++
      continue
    }

    // ---- 列表 ----
    const unordered = /^[-*+]\s+(.*)$/.exec(t)
    if (unordered) {
      lines.push({ cls: 'md-li', bullet: '•', segs: parseInline(unordered[1]) })
      i++
      continue
    }
    const ordered = /^(\d{1,3})[.)]\s+(.*)$/.exec(t)
    if (ordered) {
      lines.push({ cls: 'md-li', bullet: `${ordered[1]}.`, segs: parseInline(ordered[2]) })
      i++
      continue
    }

    // ---- 普通段落 ----
    lines.push({ cls: 'md-p', segs: parseInline(t) })
    i++
  }

  if (inCode && codeBuf.length) {
    lines.push({ cls: 'md-code-block', raw: codeBuf.join('\n') })
  }
  return lines
}
