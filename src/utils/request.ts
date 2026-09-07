// 跨端通用请求封装 (微信小程序 / H5 / App)
const BASE_URL = 'http://localhost:8080/api' // 本地开发后端接口地址

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: any
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
        if (res.statusCode === 200) {
          const body = res.data
          if (body.code === 200) {
            resolve(body.data)
          } else if (body.code === 401) {
            uni.showToast({ title: '请先登录', icon: 'none' })
            uni.removeStorageSync('student_token')
            reject(new Error(body.message || 'Unauthorized'))
          } else {
            uni.showToast({ title: body.message || '请求失败', icon: 'none' })
            reject(new Error(body.message || 'Error'))
          }
        } else {
          uni.showToast({ title: `网络异常: ${res.statusCode}`, icon: 'none' })
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络连接超时', icon: 'none' })
        reject(err)
      }
    })
  })
}

export default request
