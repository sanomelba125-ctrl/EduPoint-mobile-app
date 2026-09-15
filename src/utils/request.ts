// 跨端通用请求封装 (微信小程序 / H5 / App)
const getBaseUrl = (): string => {
  // #ifdef H5
  return '/api'
  // #endif
  // #ifndef H5
  return 'http://localhost:8088/api'
  // #endif
}
const BASE_URL = getBaseUrl()

export interface ApiError extends Error {
  code?: number
  httpStatus?: number
}

export class ApiErrorImpl extends Error implements ApiError {
  code?: number
  httpStatus?: number

  constructor(message: string, code?: number, httpStatus?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: any
  showToast?: boolean // 默认 false，由调用页面 catch 自行统一展示 Toast，避免双重弹窗
}

export const request = <T = any>(options: RequestOptions): Promise<T> => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('student_token')
    const header: any = {
      'Content-Type': 'application/json',
      ...options.header
    }
    if (token) {
      header['satoken'] = token
    }

    uni.request({
      url: options.url.startsWith('http') ? options.url : `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: header,
      timeout: 10000,
      success: (res: any) => {
        // 1. HTTP 状态码 200，检查后端业务包装状态码
        if (res.statusCode === 200) {
          const body = res.data
          if (body && body.code === 200) {
            resolve(body.data)
            return
          }

          // 业务 code != 200，必须 reject，保留后端原始信息
          const errorMsg = body?.message || '请求失败'
          const errorCode = body?.code !== undefined ? body.code : -1

          if (errorCode === 401) {
            uni.removeStorageSync('student_token')
            uni.removeStorageSync('student_user_info')
            uni.reLaunch({ url: '/pages/login/index' })
          }

          const apiError = new ApiErrorImpl(errorMsg, errorCode, 200)
          if (options.showToast) {
            uni.showToast({ title: errorMsg, icon: 'none' })
          }
          reject(apiError)
          return
        }

        // 2. HTTP 状态码非 200 (如 404 / 500 / 502)
        const errorMsg = res.data?.message || `网络异常: ${res.statusCode}`
        const errorCode = res.data?.code !== undefined ? res.data.code : res.statusCode
        const apiError = new ApiErrorImpl(errorMsg, errorCode, res.statusCode)

        if (options.showToast) {
          uni.showToast({ title: errorMsg, icon: 'none' })
        }
        reject(apiError)
      },
      fail: (err: any) => {
        const errorMsg = err?.errMsg || '网络连接异常，请稍后重试'
        const apiError = new ApiErrorImpl(errorMsg, -1, 0)
        if (options.showToast) {
          uni.showToast({ title: errorMsg, icon: 'none' })
        }
        reject(apiError)
      }
    })
  })
}

export default request

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' && message.trim() ? message.trim() : fallback
}
