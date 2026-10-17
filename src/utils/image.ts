import { getBaseUrl } from '@/utils/request'

/**
 * 图片地址归一化 (跨端兼容)
 *
 * 背景：后端对象存储支持 local / qiniu 两种模式。
 *  - qiniu 模式返回自有域名绝对地址 (https://xxx.com/images/a.png)
 *  - local 模式返回相对地址 (/api/common/file/xxx.png)
 *
 * H5 端相对地址可走同源 / Vite 代理直接渲染；
 * 但小程序 / App 端没有代理层，image 组件拿到 `/api/...` 会解析失败（图片空白），
 * 因此这里统一补全为后端的绝对地址。
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url) return ''

  // 已是绝对地址 (http/https) 或 base64 / blob 等本地临时地址，原样返回
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }

  // 相对路径：H5 走同源代理，其余端补全为后端绝对地址
  if (url.startsWith('/')) {
    // #ifdef H5
    return url
    // #endif

    // #ifndef H5
    const base = getBaseUrl()
    // base 形如 http://localhost:8080/api 或 /api，去掉结尾的 /api 后与相对路径拼接
    const origin = base.replace(/\/api\/?$/, '')
    return `${origin}${url}`
    // #endif
  }

  return url
}
