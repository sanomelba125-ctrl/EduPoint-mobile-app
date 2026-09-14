import { useUserStore } from '@/stores/user'

// 跨端通用请求封装 (微信小程序 / H5 / App)
const BASE_URL = 'http://localhost:8080/api' // 本地开发后端接口地址

let isHandling401 = false

/**
 * 统一处理 401 登录失效：
 * 1. 一次性调用 userStore.logout()，安全关闭 WebSocket 连接并重置 Pinia 状态
 * 2. 清除正确的本地缓存键名 student_token 与 student_info（防止信息残留）
 * 3. 防抖跳转登录页
 */
export function handleUnauthorized(message?: string) {
  try {
    const userStore = useUserStore()
    userStore.logout()
  } catch {
    // 降级兜底：清除正确的本地存储键名
    uni.removeStorageSync('student_token')
    uni.removeStorageSync('student_info')
  }

  if (!isHandling401) {
    isHandling401 = true
    uni.showToast({
      title: message || '登录已过期，请重新登录',
      icon: 'none'
    })
    setTimeout(() => {
      uni.reLaunch({
        url: '/pages/login/index',
        complete: () => {
          isHandling401 = false
        }
      })
    }, 400)
  }
}

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
            handleUnauthorized(errorMsg)
          }

          const apiError = new ApiErrorImpl(errorMsg, errorCode, 200)
          if (options.showToast) {
            uni.showToast({ title: errorMsg, icon: 'none' })
          }
          reject(apiError)
          return
        }

        // 2. HTTP 状态码非 200 (如 401 / 404 / 500 / 502)
        const errorMsg = res.data?.message || `网络异常: ${res.statusCode}`
        const errorCode = res.data?.code !== undefined ? res.data.code : res.statusCode
        const apiError = new ApiErrorImpl(errorMsg, errorCode, res.statusCode)

        if (res.statusCode === 401 || errorCode === 401) {
          handleUnauthorized(errorMsg)
        }

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
