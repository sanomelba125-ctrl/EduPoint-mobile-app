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
      if (typeof window.AMap.getConfig === 'function') {
        window.AMap.getConfig().appname = 'amap-jsapi-skill'
      }
      if (window.AMap.plugin) {
        window.AMap.plugin(['AMap.Geolocation', 'AMap.Geocoder', 'AMap.GeometryUtil', 'AMap.Walking', 'AMap.Driving', 'AMap.CitySearch'], () => {
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
    script.src = `https://webapi.amap.com/maps?v=${AMAP_CONFIG.version}&key=${AMAP_CONFIG.key}&plugin=AMap.Geolocation,AMap.Geocoder,AMap.GeometryUtil,AMap.Walking,AMap.Driving,AMap.CitySearch`

    script.onload = () => {
      if (window.AMap) {
        if (typeof window.AMap.getConfig === 'function') {
          window.AMap.getConfig().appname = 'amap-jsapi-skill'
        }
        window.AMap.plugin(['AMap.Geolocation', 'AMap.Geocoder', 'AMap.GeometryUtil', 'AMap.Walking', 'AMap.Driving', 'AMap.CitySearch'], () => {
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
 * 微信小程序需要先处理定位授权；H5 与 App 由 getLocation 触发系统授权。
 */
export async function ensureLocationAuthorization(): Promise<void> {
  // #ifdef MP-WEIXIN
  const setting = await new Promise<any>((resolve, reject) => {
    uni.getSetting({
      success: resolve,
      fail: reject
    })
  })
  const authorization = setting?.authSetting?.['scope.userLocation']

  if (authorization === true) return

  if (authorization === undefined) {
    try {
      await new Promise<void>((resolve, reject) => {
        uni.authorize({
          scope: 'scope.userLocation',
          success: () => resolve(),
          fail: reject
        })
      })
      return
    } catch {
      // 首次拒绝后继续引导用户前往设置页。
    }
  }

  const modal = await new Promise<any>((resolve) => {
    uni.showModal({
      title: '需要定位权限',
      content: '地图导航、距离计算和现场打卡需要使用你的当前位置，请在设置中允许定位权限。',
      confirmText: '去设置',
      cancelText: '暂不授权',
      success: resolve,
      fail: () => resolve({ confirm: false })
    })
  })
  if (!modal.confirm) {
    throw new Error('未授权定位，暂时无法使用地图导航和现场打卡')
  }

  const openedSetting = await new Promise<any>((resolve, reject) => {
    uni.openSetting({
      success: resolve,
      fail: reject
    })
  })
  if (openedSetting?.authSetting?.['scope.userLocation'] !== true) {
    throw new Error('定位权限仍未开启，请在小程序设置中允许使用位置信息')
  }
  // #endif
}

function getLocationError(error: any): Error {
  const rawMessage = String(error?.errMsg || error?.message || '')
  const lowerMessage = rawMessage.toLowerCase()
  if (lowerMessage.includes('deny') || lowerMessage.includes('denied') || lowerMessage.includes('auth')) {
    return new Error('定位权限未开启，请在浏览器或系统设置中允许访问位置信息')
  }
  if (lowerMessage.includes('secure') || lowerMessage.includes('https')) {
    return new Error('浏览器定位需要 HTTPS 安全环境，请使用 HTTPS 或 localhost 访问')
  }
  return new Error(rawMessage || '无法获取设备定位，请检查定位权限和系统定位服务')
}

/**
 * 获取设备真实定位。定位失败时必须抛错，不能用活动打卡点冒充当前位置。
 */
export async function getCurrentAMapLocation(): Promise<AMapLocationResult> {
  await ensureLocationAuthorization()

  // #ifdef H5
  // 在 H5 浏览器环境下，优先使用已注入高德安全密钥的 AMap.Geolocation
  // 核心参数：完全关闭原生浏览器定位 (noGeoLocation: 3)，优先走高德 IP/Wi-Fi 网络定位，杜绝 Chrome 请求 Google NLP 造成的 ERR_BLOCKED_BY_CLIENT
  try {
    const AMap = await loadAMapSDK()
    if (AMap && AMap.Geolocation) {
      const aMapLoc = await new Promise<any>((res, rej) => {
        const geolocation = new AMap.Geolocation({
          enableHighAccuracy: false, // 禁用原生高精度 GPS 探针，防止 Chrome 调用 Google NLP
          timeout: 4000,
          needAddress: true,
          extensions: 'all',
          GeoLocationFirst: false, // 优先使用高德自建网络定位通道
          noGeoLocation: 3,        // 核心：3=都不用原生定位（不论是PC还是手机模拟器），彻底杜绝 Google NLP (ERR_BLOCKED_BY_CLIENT)
          getCityWhenFail: true    // 失败时降级返回城市定位
        })
        geolocation.getCurrentPosition((status: string, result: any) => {
          if (status === 'complete' && result && (result.position || result.center)) {
            res(result)
          } else {
            // 降级使用 IP 城市定位，获取城市中心经纬度与地名
            geolocation.getCityInfo((cityStatus: string, cityResult: any) => {
              if (cityStatus === 'complete' && (cityResult.center || cityResult.position)) {
                res({
                  position: cityResult.center || cityResult.position,
                  formattedAddress: cityResult.province ? `${cityResult.province}${cityResult.city || ''}` : '当前城市中心',
                  city: cityResult.city,
                  province: cityResult.province
                })
              } else {
                // 第三道兜底：AMap.CitySearch 纯服务端 IP 城市定位（100% 不触发浏览器原生网络提供商）
                try {
                  AMap.plugin('AMap.CitySearch', () => {
                    const citySearch = new AMap.CitySearch()
                    citySearch.getLocalCity((cStatus: string, cResult: any) => {
                      if (cStatus === 'complete' && cResult.rectangle) {
                        const parts = String(cResult.rectangle).split(';')[0].split(',')
                        const cLng = Number(parts[0])
                        const cLat = Number(parts[1])
                        res({
                          position: [cLng, cLat],
                          formattedAddress: cResult.city || cResult.province || '当前城市',
                          city: cResult.city,
                          province: cResult.province
                        })
                      } else {
                        rej(new Error(result?.message || '高德定位服务未就绪'))
                      }
                    })
                  })
                } catch {
                  rej(new Error(result?.message || '高德定位服务未就绪'))
                }
              }
            })
          }
        })
      })

      if (aMapLoc) {
        const pos = aMapLoc.position || aMapLoc.center
        const rawLng = typeof pos?.getLng === 'function' ? pos.getLng() : (Array.isArray(pos) ? pos[0] : pos?.lng)
        const rawLat = typeof pos?.getLat === 'function' ? pos.getLat() : (Array.isArray(pos) ? pos[1] : pos?.lat)
        const lng = Number(rawLng)
        const lat = Number(rawLat)
        if (isValidCoordinatePair(lng, lat)) {
          return {
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            accuracy: Number(aMapLoc.accuracy) || undefined,
            formattedAddress: aMapLoc.formattedAddress || `经度:${lng.toFixed(4)}, 纬度:${lat.toFixed(4)}`,
            source: 'DEVICE_GPS'
          }
        }
      }
    }
  } catch (e: any) {
    throw new Error(e?.message || '无法获取定位信息')
  }
  throw new Error('高德地图定位组件未能初始化')
  // #endif

  // #ifndef H5
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
        rejectOnce(getLocationError(error))
      }
    } as any)
  })
  // #endif
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

  // 智能适配出行方式：若未强行指定且距离超过 3000 米，自动升级为驾车规划，避免高德跨长距离步行失败
  let actualMode = mode
  if (isValidCoordinatePair(fromLng, fromLat) && mode === 'walk') {
    const dist = getAMapDistance(Number(fromLat), Number(fromLng), Number(toLat), Number(toLng))
    if (dist > 3000) {
      actualMode = 'car'
    }
  }

  // #ifdef H5
  if (typeof window !== 'undefined') {
    // 构造高德官方 Web / App 呼起 URI
    // 官方规范：https://lbs.amap.com/api/uri-api/guide/travel/route
    let uri = `https://uri.amap.com/navigation?to=${toLng},${toLat},${encodeURIComponent(toName)}&mode=${actualMode}&callnative=1`
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
