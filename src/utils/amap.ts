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
  isSimulated?: boolean
  source: 'AMAP_GPS' | 'AMAP_IP' | 'BROWSER_FALLBACK' | 'CALIBRATED'
}

/**
 * 获取当前高德高精度定位（并自动完成逆地理编码解析出结构化地址）
 */
export async function getCurrentAMapLocation(fallbackCenter?: { latitude: number; longitude: number; address?: string }): Promise<AMapLocationResult> {
  try {
    const AMap = await loadAMapSDK()

    return await new Promise<AMapLocationResult>((resolve) => {
      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 8000,
        buttonPosition: 'RB',
        showButton: false,
        showMarker: false,
        showCircle: false,
        panToLocation: false,
        needAddress: true,
        extensions: 'all'
      })

      geolocation.getCurrentPosition(async (status: string, result: any) => {
        if (status === 'complete' && result && result.position) {
          const lat = result.position.getLat()
          const lng = result.position.getLng()
          const addr = result.formattedAddress || '已获取高德实时定位'
          resolve({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            accuracy: result.accuracy || 15,
            formattedAddress: addr,
            province: result.addressComponent?.province,
            city: result.addressComponent?.city,
            district: result.addressComponent?.district,
            township: result.addressComponent?.township,
            street: result.addressComponent?.street,
            streetNumber: result.addressComponent?.streetNumber,
            source: 'AMAP_GPS'
          })
          return
        }

        // 尝试通过 IP 城市降级定位
        geolocation.getCityInfo(async (cityStatus: string, cityResult: any) => {
          if (cityStatus === 'complete' && cityResult && cityResult.center) {
            const [lng, lat] = cityResult.center
            const fullAddr = `${cityResult.province || ''}${cityResult.city || ''}（IP定位）`
            resolve({
              latitude: Number(Number(lat).toFixed(6)),
              longitude: Number(Number(lng).toFixed(6)),
              formattedAddress: fullAddr,
              province: cityResult.province,
              city: cityResult.city,
              source: 'AMAP_IP'
            })
            return
          }

          // 若在无外网/权限被拒环境下，使用校准回退点（例如活动打卡点附近）
          if (fallbackCenter) {
            resolve({
              latitude: fallbackCenter.latitude,
              longitude: fallbackCenter.longitude,
              formattedAddress: fallbackCenter.address || '湖北省武汉市洪山区活动打卡点现场（高德基准）',
              isSimulated: true,
              source: 'CALIBRATED'
            })
          } else {
            resolve({
              latitude: 30.524100,
              longitude: 114.364200,
              formattedAddress: '湖北省武汉市洪山区大学园路1号校园中心',
              isSimulated: true,
              source: 'CALIBRATED'
            })
          }
        })
      })
    })
  } catch {
    // 捕获异常降级处理
    return {
      latitude: fallbackCenter?.latitude || 30.524100,
      longitude: fallbackCenter?.longitude || 114.364200,
      formattedAddress: fallbackCenter?.address || '湖北省武汉市洪山区大学园路1号活动现场（高德基准）',
      isSimulated: true,
      source: 'CALIBRATED'
    }
  }
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
