/**
 * 高德地图 (AMap) 定位与地理编码服务工具模块
 * 
 * 包含：
 * 1. AMap JS SDK 异步安全加载 (包含 securityJsCode)
 * 2. 实时高精度定位 (AMap.Geolocation)
 * 3. 逆地理编码 regeo：经纬度 -> 真实结构化地址 (AMap.Geocoder)
 * 4. 地理编码 geo：地址文字 -> 经纬度坐标 (AMap.Geocoder)
 * 5. 精确球面测距 (AMap.GeometryUtil.distance)
 */

export const AMAP_CONFIG = {
  key: 'f2bb704018d6fb8aafa3d1bcb880b62d',
  securityJsCode: '77b5607769c0e45c2ad22c6b454220ca',
  version: '2.0'
}

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string
      serviceHost?: string
    }
    AMap?: any
  }
}

let amapLoadPromise: Promise<any> | null = null

/**
 * 确保高德地图 SDK 加载并注入安全密钥配置
 */
export function loadAMapSDK(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('AMap can only run in browser environment'))
  }

  if (window.AMap && window.AMap.Geolocation) {
    return Promise.resolve(window.AMap)
  }

  if (amapLoadPromise) {
    return amapLoadPromise
  }

  amapLoadPromise = new Promise((resolve, reject) => {
    // 注入高德安全密钥（必须在引入 JS 之前注入）
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_CONFIG.securityJsCode
    }

    if (window.AMap) {
      if (window.AMap.plugin) {
        window.AMap.plugin(['AMap.Geolocation', 'AMap.Geocoder', 'AMap.GeometryUtil'], () => {
          resolve(window.AMap)
        })
      } else {
        resolve(window.AMap)
      }
      return
    }

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = `https://webapi.amap.com/maps?v=${AMAP_CONFIG.version}&key=${AMAP_CONFIG.key}&plugin=AMap.Geolocation,AMap.Geocoder,AMap.GeometryUtil`

    script.onload = () => {
      if (window.AMap) {
        window.AMap.plugin(['AMap.Geolocation', 'AMap.Geocoder', 'AMap.GeometryUtil'], () => {
          resolve(window.AMap)
        })
      } else {
        reject(new Error('高德地图 SDK 加载失败'))
      }
    }

    script.onerror = (err) => {
      reject(new Error('加载高德地图脚本网络异常: ' + String(err)))
    }

    document.head.appendChild(script)
  })

  return amapLoadPromise
}

export interface AMapLocationResult {
  latitude: number
  longitude: number
  accuracy?: number
  formattedAddress: string
  province?: string
  city?: string
  district?: string
  township?: string
  street?: string
  streetNumber?: string
  source: 'DEVICE_GPS'
}

/**
 * 获取设备真实定位。定位失败时必须抛错，不能用活动打卡点冒充当前位置。
 */
export function getCurrentAMapLocation(): Promise<AMapLocationResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('获取设备定位超时，请检查定位权限后重试'))
      }
    }, 10000)

    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(error)
    }

    uni.getLocation({
      type: 'gcj02',
      altitude: false,
      geocode: true,
      success: async (result: any) => {
        if (settled) return
        const latitude = Number(result.latitude)
        const longitude = Number(result.longitude)
        if (!isValidCoordinatePair(longitude, latitude)) {
          rejectOnce(new Error('设备返回的定位坐标无效'))
          return
        }

        let formattedAddress = result.address?.formattedAddress || result.address || ''
        // #ifdef H5
        if (!formattedAddress) {
          formattedAddress = await getAMapAddress(latitude, longitude)
        }
        // #endif

        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        resolve({
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          accuracy: Number(result.accuracy) || undefined,
          formattedAddress: formattedAddress || `经度:${longitude.toFixed(4)}, 纬度:${latitude.toFixed(4)}`,
          source: 'DEVICE_GPS'
        })
      },
      fail: (error: any) => {
        rejectOnce(new Error(error?.errMsg || '无法获取设备定位，请检查定位权限'))
      }
    } as any)
  })
}

export function isValidCoordinatePair(longitude: unknown, latitude: unknown): boolean {
  const lng = Number(longitude)
  const lat = Number(latitude)
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

/**
 * 逆地理编码（Re-geocoding）：经纬度 -> 详细地址
 * 对照高德官方接口：https://lbs.amap.com/api/webservice/guide/api/georegeo
 */
export async function getAMapAddress(latitude: number, longitude: number): Promise<string> {
  try {
    const AMap = await loadAMapSDK()
    return await new Promise<string>((resolve) => {
      const geocoder = new AMap.Geocoder({
        radius: 1000,
        extensions: 'all'
      })
      geocoder.getAddress([longitude, latitude], (status: string, result: any) => {
        if (status === 'complete' && result && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '未知地址')
        } else {
          resolve(`经度:${longitude.toFixed(4)}, 纬度:${latitude.toFixed(4)}`)
        }
      })
    })
  } catch {
    return `经度:${longitude.toFixed(4)}, 纬度:${latitude.toFixed(4)}`
  }
}

/**
 * 地理编码（Geocoding）：详细地址 -> 经纬度 [longitude, latitude]
 */
export async function getAMapCoords(address: string, city?: string): Promise<[number, number] | null> {
  try {
    const AMap = await loadAMapSDK()
    return await new Promise<[number, number] | null>((resolve) => {
      const geocoder = new AMap.Geocoder({
        city: city || '全国'
      })
      geocoder.getLocation(address, (status: string, result: any) => {
        if (status === 'complete' && result && result.geocodes && result.geocodes.length > 0) {
          const loc = result.geocodes[0].location
          resolve([loc.getLng(), loc.getLat()])
        } else {
          resolve(null)
        }
      })
    })
  } catch {
    return null
  }
}

/**
 * 计算两个经纬度之间的准确地表测距（米）
 * 优先调用高德 AMap.GeometryUtil.distance 精确几何计算
 */
export function getAMapDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  try {
    if (window.AMap && window.AMap.GeometryUtil && typeof window.AMap.GeometryUtil.distance === 'function') {
      const p1 = [lon1, lat1]
      const p2 = [lon2, lat2]
      return Math.round(window.AMap.GeometryUtil.distance(p1, p2))
    }
  } catch {
    // 忽略异常，降级到球面公式
  }

  // 降级使用 Haversine 球面距离公式
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180.0
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

export interface NavigationOptions {
  fromLng?: number
  fromLat?: number
  fromName?: string
  toLng: number
  toLat: number
  toName: string
  toAddress?: string
  mode?: 'walk' | 'ride' | 'car'
}

/**
 * 唤起高德地图导航服务
 * 支持 H5 端调用高德官方 URI / 客户端呼起，以及跨端 uni.openLocation
 */
export function openAMapNavigation(options: NavigationOptions): void {
  const { fromLng, fromLat, fromName = '我的位置', toLng, toLat, toName, toAddress, mode = 'walk' } = options

  if (!isValidCoordinatePair(toLng, toLat)) {
    uni.showToast({ title: '活动地点坐标无效', icon: 'none' })
    return
  }

  // #ifdef H5
  if (typeof window !== 'undefined') {
    // 构造高德官方 Web / App 呼起 URI
    // 官方规范：https://lbs.amap.com/api/uri-api/guide/travel/route
    let uri = `https://uri.amap.com/navigation?to=${toLng},${toLat},${encodeURIComponent(toName)}&mode=${mode}&callnative=1`
    if (isValidCoordinatePair(fromLng, fromLat)) {
      uri += `&from=${fromLng},${fromLat},${encodeURIComponent(fromName)}`
    }
    window.open(uri, '_blank')
    return
  }
  // #endif

  // 小程序或原生 App 环境使用 uni.openLocation
  uni.openLocation({
    latitude: toLat,
    longitude: toLng,
    name: toName,
    address: toAddress || toName,
    scale: 16,
    fail: (err: any) => {
      console.warn('uni.openLocation 调用失败，降级提示:', err)
      uni.showToast({ title: '未能打开地图导航', icon: 'none' })
    }
  })
}
