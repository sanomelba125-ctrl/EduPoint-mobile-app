<template>
  <svg
    class="app-icon"
    :style="sizeStyle"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="resolvedColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in paths" :key="'p' + i" :d="d" />
    <circle v-for="(c, i) in circles" :key="'c' + i" :cx="c[0]" :cy="c[1]" :r="c[2]" />
  </svg>
</template>

<script setup lang="ts">
/**
 * 统一线性图标组件（24×24 网格 / 2px 描边 / 圆角端点，Feather-Lucide 风格）
 *
 * 背景：移动端此前混用了四种图标语言 ——
 *   ① 各页各自定义的内联 SVG（粗细与端点风格不一）
 *   ② emoji（🤖 🎓 🔔 📦 🎁 🏆 …，跨端字形差异大、颜色不可控）
 *   ③ 少数位置图标缺失（如个人中心"电子荣誉证书"是个空白圆点）
 *   ④ 管理端遗留的 Element 风格图标
 * 本组件把常用图标收敛成一套，供各页面统一调用。
 *
 * 用法（uni-app easycom 自动注册，无需 import）：
 *   <app-icon name="bot" :size="68" />
 *   <app-icon name="gift" color="#2563eb" :size="32" />
 *
 * 尺寸单位为 rpx（移动端按屏宽缩放）；颜色默认 currentColor，跟随父级文字色。
 */
import { computed } from 'vue'

interface IconDef {
  /** path 的 d 属性 */
  paths?: string[]
  /** 圆 [cx, cy, r] */
  circles?: number[][]
}

/** 图标表 */
const ICONS: Record<string, IconDef> = {
  /* ==================== 身份 ==================== */
  /** 机器人（AI 助手）：头身一体 + 天线 + 双眼 */
  bot: {
    paths: [
      'M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
      'M12 3v5',
      'M9 13h.01',
      'M15 13h.01'
    ],
    circles: [[12, 2, 1]]
  },
  /** 学生（毕业帽） */
  graduate: {
    paths: ['M22 10 12 5 2 10l10 5 10-5Z', 'M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5']
  },
  user: {
    paths: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'],
    circles: [[12, 7, 4]]
  },

  /* ==================== 业务 ==================== */
  calendar: {
    paths: [
      'M8 2v4',
      'M16 2v4',
      'M3 10h18',
      'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
    ]
  },
  'shopping-bag': {
    paths: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0']
  },
  gift: {
    paths: [
      'M3 12h18',
      'M12 8v13',
      'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7',
      'M7.5 8a2.5 2.5 0 0 1 0-5C9.8 3 12 5 12 8c0-3 2.2-5 4.5-5a2.5 2.5 0 0 1 0 5'
    ]
  },
  package: {
    paths: [
      'M16.5 9.4 7.5 4.21',
      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
      'M3.3 7 12 12l8.7-5',
      'M12 22V12'
    ]
  },
  'bar-chart': {
    paths: ['M12 20V10', 'M18 20V4', 'M6 20v-4']
  },
  award: {
    paths: ['M8.2 14.6 7 22l5-3 5 3-1.2-7.4'],
    circles: [[12, 8, 6]]
  },
  certificate: {
    paths: ['M4 3h16v12H4z', 'M8 7h8', 'M8 11h5', 'M9 19l1.5-1.5L12 19l1.5-1.5L15 19v2l-3-1-3 1Z']
  },
  coins: {
    paths: ['M8 15h8', 'M12 15v3', 'M18 4h-3l-2 3h5a1 1 0 0 1 1 1v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a1 1 0 0 1 1-1h3']
  },
  ticket: {
    paths: [
      'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
      'M13 5v2',
      'M13 17v2',
      'M13 11v2'
    ]
  },
  trophy: {
    paths: [
      'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
      'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
      'M4 22h16',
      'M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22',
      'M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8',
      'M18 2H6v7a6 6 0 0 0 12 0V2Z'
    ]
  },
  /** 皇冠（冠军专属，仅第 1 名使用） */
  crown: {
    paths: [
      'M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.66a.5.5 0 0 1 .8.52l-2.83 10.24a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.03a.5.5 0 0 1 .8-.52l4.27 3.66a1 1 0 0 0 1.52-.3z',
      'M5 21h14'
    ]
  },

  /* ==================== 通知 / 状态 ==================== */
  bell: {
    paths: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0']
  },
  megaphone: {
    paths: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6']
  },
  'map-pin': {
    paths: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'],
    circles: [[12, 10, 3]]
  },
  target: {
    circles: [[12, 12, 10], [12, 12, 6], [12, 12, 2]]
  },
  zap: {
    paths: ['M13 2 3 14h9l-1 8 10-12h-9l1-8Z']
  },
  sparkles: {
    paths: [
      'm12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z',
      'M19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6L19 15Z'
    ]
  },
  flame: {
    paths: [
      'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z'
    ]
  },
  'check-circle': {
    paths: ['m9 12 2 2 4-4'],
    circles: [[12, 12, 10]]
  },
  'alert-circle': {
    paths: ['M12 8v4', 'M12 16h.01'],
    circles: [[12, 12, 10]]
  },
  info: {
    paths: ['M12 16v-4', 'M12 8h.01'],
    circles: [[12, 12, 10]]
  },
  clock: {
    paths: ['M12 6v6l4 2'],
    circles: [[12, 12, 10]]
  },
  lock: {
    paths: [
      'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
      'M7 11V7a5 5 0 0 1 10 0v4'
    ]
  },
  star: {
    paths: ['M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1L12 2z']
  },

  /* ==================== 操作 ==================== */
  trash: {
    paths: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6']
  },
  search: {
    paths: ['m21 21-4.3-4.3'],
    circles: [[11, 11, 8]]
  },
  'chevron-right': {
    paths: ['m9 18 6-6-6-6']
  },
  /** 发送（纸飞机） */
  send: {
    paths: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13']
  },
  /** 相机（上传 / 更换头像） */
  camera: {
    paths: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z'],
    circles: [[12, 13, 3]]
  },
  'log-in': {
    paths: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'm10 17 5-5-5-5', 'M15 12H3']
  },
  'file-text': {
    paths: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8']
  },
  qrcode: {
    paths: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M3 15h6v6H3z', 'M15 15h2v2h-2z', 'M19 19h2v2h-2z', 'M15 19v2', 'M19 15h2']
  },
  rocket: {
    paths: [
      'M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z',
      'm12 15-3-3a22 22 0 0 1 2-4 12.9 12.9 0 0 1 11-6c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2Z',
      'M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0'
    ]
  },

  /* ==================== 空状态 ==================== */
  /** 空收件箱（列表为空） */
  inbox: {
    paths: [
      'M22 12h-6l-2 3h-4l-2-3H2',
      'M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z'
    ]
  },
  /** 空文件夹（无数据） */
  folder: {
    paths: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']
  },
  /** 断网（加载失败） */
  'wifi-off': {
    paths: ['M12 20h.01', 'm2 8.8 2 1.6', 'M5 12.6l2 1.6', 'M8 16.4l2 1.6', 'm22 8.8-9 7.2', 'm17 5.3 5 3.5', 'm2 2 20 20', 'M8.5 8.5a10 10 0 0 1 7 0']
  }
}

/**
 * 把尺寸换算为 CSS 可用的长度值。
 *
 * ⚠️ 关键坑：**不能把 rpx 写进 SVG 的 width/height 属性**。
 * rpx 是 uni-app 的 CSS 单位，只在样式表里被编译；SVG 的 width/height 属性是
 * 普通 XML 属性，浏览器不认 "40rpx" 这个值，会直接回退到默认尺寸（撑满容器），
 * 表现为「图标大得离谱」。因此这里经 style 绑定输出，并在 H5 端手动把 rpx 换算成 px。
 */
function toCssSize(size: number | string): string {
  if (typeof size !== 'number') return size
  // #ifdef H5
  const base = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 375
  return `${(size * base) / 750}px`
  // #endif
  // #ifndef H5
  return `${size}rpx`
  // #endif
}

const props = withDefaults(
  defineProps<{
    name: string
    /** 尺寸：数字按 750 设计稿的 rpx 处理，也可直接传 '32px' / '1em' */
    size?: number | string
    color?: string
    strokeWidth?: number | string
  }>(),
  {
    size: 40,
    color: 'currentColor',
    strokeWidth: 2
  }
)

const sizeStyle = computed(() => {
  const v = toCssSize(props.size)
  return { width: v, height: v }
})
const resolvedColor = computed(() => props.color || 'currentColor')
const def = computed<IconDef>(() => ICONS[props.name] || ICONS['info'])
const paths = computed(() => def.value.paths || [])
const circles = computed(() => def.value.circles || [])

defineOptions({ name: 'AppIcon' })
</script>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
