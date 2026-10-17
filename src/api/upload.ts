import { getBaseUrl, handleUnauthorized } from '@/utils/request'

/**
 * 图片上传接口封装
 * 对接后端 UploadController: POST /api/common/upload  (@SaCheckLogin)
 * 后端按 campus.oss.type 自动选择七牛云或本地磁盘存储，前端无需感知差异。
 */

/** 允许上传的图片后缀（与后端 QiniuServiceImpl.ALLOWED_EXTENSIONS 保持一致） */
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']

/** 单张图片大小上限 5MB（头像场景足够） */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024

/**
 * 提取扩展名（兼容带查询串的地址）
 */
function getExtension(nameOrPath: string): string {
  const clean = (nameOrPath || '').split('?')[0].split('#')[0]
  const idx = clean.lastIndexOf('.')
  if (idx < 0) return ''
  return clean.slice(idx + 1).toLowerCase()
}

/**
 * 上传前的前置校验，返回错误文案；校验通过返回 null
 *
 * ⚠️ 注意传入的应当是**文件名**而非 H5 端的 tempFilePaths：
 * H5 端 uni.chooseImage 返回的 tempFilePaths 是 `blob:http://host/uuid` 形式，
 * 不含扩展名，用它判断会把合法图片误判为非法格式（实测踩过）；
 * 应优先使用 tempFiles[0].name。
 *
 * 若确实取不到扩展名，则不做拦截，交由后端做权威校验。
 */
export function validateImage(fileNameOrPath: string, size?: number): string | null {
  const ext = getExtension(fileNameOrPath)
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    return `仅支持 ${ALLOWED_EXTENSIONS.join('/')} 格式的图片`
  }
  if (typeof size === 'number' && size > MAX_IMAGE_SIZE) {
    return `图片不能超过 ${Math.round(MAX_IMAGE_SIZE / 1024 / 1024)}MB`
  }
  return null
}

/**
 * 选择并上传一张图片，成功后返回可渲染的图片地址
 * @param filePath 本地临时文件路径（uni.chooseImage 返回的 tempFilePaths[0]）
 * @param size     文件字节数（tempFiles[0].size，用于前置体积拦截）
 * @param fileName 原始文件名（tempFiles[0].name，H5 端用于扩展名校验）
 */
export function uploadImageApi(filePath: string, size?: number, fileName?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const invalid = validateImage(fileName || filePath, size)
    if (invalid) {
      reject(new Error(invalid))
      return
    }

    const token = uni.getStorageSync('student_token')

    uni.uploadFile({
      url: `${getBaseUrl()}/common/upload`,
      filePath,
      // 必须与后端 @RequestParam("file") 的参数名一致
      name: 'file',
      header: token ? { satoken: token } : {},
      success: (res: any) => {
        // uploadFile 的 data 是字符串，需手动解析为 JSON
        let body: any
        try {
          body = JSON.parse(res.data)
        } catch (e) {
          reject(new Error('上传响应解析失败'))
          return
        }

        if (res.statusCode === 200 && body && body.code === 200) {
          resolve(body.data as string)
          return
        }

        if (res.statusCode === 401 || body?.code === 401) {
          handleUnauthorized(body?.message)
        }
        reject(new Error(body?.message || `图片上传失败 (${res.statusCode})`))
      },
      fail: (err: any) => {
        reject(new Error(err?.errMsg || '图片上传失败，请检查网络后重试'))
      }
    })
  })
}
