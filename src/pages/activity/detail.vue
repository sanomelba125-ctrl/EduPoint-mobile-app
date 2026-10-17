<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { onLoad, onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import {
  getActivityDetailApi,
  signupActivityApi,
  cancelSignupActivityApi,
  getActivityStatusInfo,
  isActivityFull,
  promptCancelSignupModal,
  type ActivityItem,
  type ActivityStatusInfo
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import {
  getCurrentAMapLocation,
  getAMapDistance,
  isValidCoordinatePair,
  loadAMapSDK,
  openAMapNavigation,
  type AMapLocationResult
} from '@/utils/amap'

const activityId = ref<number>(1)
const loading = ref(false)
const submitting = ref(false)
const activity = ref<ActivityItem | null>(null)

// 学生定位、测距与导航状态
const userLocation = ref<AMapLocationResult | null>(null)
const locatingUser = ref(false)
const distanceToActivity = ref<number | null>(null)
const isNavigating = ref(false)
const navMapVisible = ref(false)
const navMapLoading = ref(false)
const navRouteInfo = ref<{
  distance: string
  duration: string
  mode: 'walk' | 'drive' | 'direct'
  modeName: string
} | null>(null)
let mapInstance: any = null
let myMarkerInstance: any = null
let endMarkerInstance: any = null
let fenceCircleInstance: any = null
let locationRefreshTimer: ReturnType<typeof setInterval> | null = null
let navigationInitTimer: ReturnType<typeof setTimeout> | null = null
let walkingRouteInstance: any = null
let drivingRouteInstance: any = null
let directLineInstance: any = null
let routeRequestId = 0

const updateUserMarker = (loc: AMapLocationResult) => {
  if (!mapInstance || typeof window === 'undefined' || !window.AMap) return
  const lng = Number(loc.longitude)
  const lat = Number(loc.latitude)
  if (!isValidCoordinatePair(lng, lat)) return
  const position = [lng, lat]
  const AMap = window.AMap

  if (!myMarkerInstance) {
    myMarkerInstance = new AMap.Marker({
      position,
      title: '我的位置',
      label: {
        content: '<div style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(16,185,129,0.4);">📍 我的位置</div>',
        direction: 'top',
        offset: new AMap.Pixel(0, -4)
      }
    })
    mapInstance.add(myMarkerInstance)
  } else {
    myMarkerInstance.setPosition(position)
  }
}

/**
 * 刷新/获取用户当前定位并计算距离
 */
const refreshUserLocation = async (silent = false): Promise<boolean> => {
  if (!activity.value) return false
  locatingUser.value = true
  try {
    const loc = await getCurrentAMapLocation()
    userLocation.value = loc
    const dist = getAMapDistance(
      loc.latitude,
      loc.longitude,
      activity.value.latitude,
      activity.value.longitude
    )
    distanceToActivity.value = dist
    // 如果地图已打开，更新定位标记；仅在首次未生成路线时绘制路线，避免周期刷新触发地图动画跳变
    if (navMapVisible.value && mapInstance) {
      updateUserMarker(loc)
      if (!navRouteInfo.value) {
        drawNavigationRoute()
      }
    }
    return true
  } catch (err: any) {
    userLocation.value = null
    distanceToActivity.value = null
    if (!silent) {
      uni.showToast({ title: getApiErrorMessage(err, '获取当前定位失败，请检查定位权限'), icon: 'none' })
    }
    return false
  } finally {
    locatingUser.value = false
  }
}

/**
 * 是否已进入考勤打卡圈
 */
const isWithinFence = computed(() => {
  if (!activity.value || !activity.value.locationCheckEnabled) return true
  if (distanceToActivity.value === null) return false
  return distanceToActivity.value <= (activity.value.locationRadius || 500)
})

const hasUserDistance = computed(() => distanceToActivity.value !== null)

/**
 * 格式化距离文本
 */
const formattedDistance = computed(() => {
  if (distanceToActivity.value === null) return '计算中...'
  const dist = distanceToActivity.value
  if (dist < 1000) {
    return `${dist}米`
  }
  return `${(dist / 1000).toFixed(1)}公里`
})

/**
 * 步行预估耗时（路网折线系数 1.25，步行 4.5km/h）
 */
const estimatedDuration = computed(() => {
  if (distanceToActivity.value === null) return '计算中'
  const routeDist = distanceToActivity.value * 1.25
  const mins = Math.max(1, Math.round(routeDist / 75))
  return mins > 60 ? `${Math.floor(mins / 60)}小时${mins % 60}分钟` : `${mins} 分钟`
})

/**
 * 切换导航状态（点击导航直接在当前页面开始导航）
 */
const toggleNavigation = async () => {
  if (isNavigating.value) {
    stopNavigation()
    return
  }
  await startNavigation()
}

/**
 * 开始导航：展开地图、初始化路线、启动实时定位监听（三端兼容且不阻断首次启动）
 */
const startNavigation = async () => {
  if (!activity.value) return
  const actLng = Number(activity.value.longitude)
  const actLat = Number(activity.value.latitude)
  if (!isValidCoordinatePair(actLng, actLat)) {
    uni.showToast({ title: '活动尚未配置有效地点坐标', icon: 'none' })
    return
  }

  // #ifndef H5
  isNavigating.value = true
  openAMapNavigation({
    toLng: actLng,
    toLat: actLat,
    toName: activity.value.locationName || '活动地点',
    toAddress: activity.value.locationAddress,
    mode: 'walk'
  })
  // #endif

  // #ifdef H5
  // H5 端：立即启动导航状态并展开地图，不因设备未定位而阻断交互
  isNavigating.value = true
  navMapVisible.value = true
  navMapLoading.value = true

  await nextTick()
  // 延时等待 DOM 展开动画就绪，避免高德地图容器宽高为 0 导致渲染异常
  navigationInitTimer = setTimeout(async () => {
    navigationInitTimer = null
    if (!isNavigating.value || !navMapVisible.value) return
    await initNavMap()
    // 启动低频实时定位监听（使用 GCJ-02 真实坐标体系）
    startLocationTracking()
    // 若尚未获取定位，静默刷新定位；定位成功后会自动绘制起终点路线
    if (!userLocation.value) {
      refreshUserLocation(true)
    }
  }, 200)
  uni.showToast({ title: '已开启步行导航', icon: 'none' })
  // #endif
}

/**
 * 结束导航：退出导航状态并销毁地图与定位监听
 */
const stopNavigation = () => {
  isNavigating.value = false
  navMapVisible.value = false
  if (navigationInitTimer !== null) {
    clearTimeout(navigationInitTimer)
    navigationInitTimer = null
  }
  stopLocationTracking()
  destroyMap()
  uni.showToast({ title: '已结束导航', icon: 'none' })
}

/**
 * 呼起外部高德官方路线规划或原生 App 导航
 */
const openExternalNav = () => {
  if (!activity.value) return
  openAMapNavigation({
    fromLng: userLocation.value?.longitude,
    fromLat: userLocation.value?.latitude,
    toLng: Number(activity.value.longitude),
    toLat: Number(activity.value.latitude),
    toName: activity.value.locationName || '活动打卡点',
    toAddress: activity.value.locationAddress,
    mode: 'walk'
  })
}

/**
 * 初始化内嵌高德地图并绘制路线
 */
const initNavMap = async () => {
  try {
    const AMap = await loadAMapSDK()
    if (!AMap) return

    // 遵循高德地图 JSAPI 官方规范：在 new AMap.Map 之前注入 appname 埋点标识
    if (typeof AMap.getConfig === 'function') {
      AMap.getConfig().appname = 'amap-jsapi-skill'
    }

    if (mapInstance) {
      destroyMap()
    }

    const act = activity.value
    if (!act) return
    const actLng = Number(act.longitude)
    const actLat = Number(act.latitude)
    if (!isValidCoordinatePair(actLng, actLat)) return
    const user = userLocation.value

    // 计算中心点（起终点中心）
    const centerLng = user && isValidCoordinatePair(user.longitude, user.latitude)
      ? (Number(user.longitude) + actLng) / 2
      : actLng
    const centerLat = user && isValidCoordinatePair(user.longitude, user.latitude)
      ? (Number(user.latitude) + actLat) / 2
      : actLat

    const container = typeof document !== 'undefined' ? document.getElementById('nav-inline-map') : null
    if (!container) return

    mapInstance = new AMap.Map('nav-inline-map', {
      zoom: user ? 15 : 16,
      center: [centerLng, centerLat],
      resizeEnable: true,
      viewMode: '3D'
    })

    mapInstance.on('complete', () => {
      if (mapInstance && typeof mapInstance.resize === 'function') {
        mapInstance.resize()
      }
    })

    setTimeout(() => {
      if (mapInstance && typeof mapInstance.resize === 'function') {
        mapInstance.resize()
      }
    }, 320)

    // 活动打卡点标记（终点）
    endMarkerInstance = new AMap.Marker({
      position: [actLng, actLat],
      title: act.locationName || '活动打卡点',
      label: {
        content: `<div style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(239,68,68,0.4);">🏁 ${act.locationName || '打卡点'}</div>`,
        direction: 'top',
        offset: new AMap.Pixel(0, -4)
      }
    })
    mapInstance.add(endMarkerInstance)

    // 考勤围栏圈
    if (act.locationCheckEnabled && act.locationRadius) {
      fenceCircleInstance = new AMap.Circle({
        center: [actLng, actLat],
        radius: Number(act.locationRadius),
        strokeColor: '#2563eb',
        strokeWeight: 2,
        strokeOpacity: 0.6,
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        strokeStyle: 'dashed'
      })
      mapInstance.add(fenceCircleInstance)
    }

    // 起点标记（当前位置）
    if (user && isValidCoordinatePair(user.longitude, user.latitude)) {
      updateUserMarker(user)
      // 绘制导航路线（智能支持步行/远距离驾车与直连兜底）
      await drawNavigationRoute()
    }
  } catch (err) {
    console.error('初始化导航地图失败:', err)
    uni.showToast({ title: '加载地图失败', icon: 'none' })
  } finally {
    navMapLoading.value = false
  }
}

/**
 * 清除地图上已绘制的所有导航路线图层
 */
const clearRouteLayers = () => {
  if (walkingRouteInstance && typeof walkingRouteInstance.clear === 'function') {
    try { walkingRouteInstance.clear() } catch {}
  }
  walkingRouteInstance = null

  if (drivingRouteInstance && typeof drivingRouteInstance.clear === 'function') {
    try { drivingRouteInstance.clear() } catch {}
  }
  drivingRouteInstance = null

  if (directLineInstance && mapInstance) {
    try { mapInstance.remove(directLineInstance) } catch {}
  }
  directLineInstance = null
}

/**
 * 智能路径规划与地图路线绘制
 * 遵循高德地图 JSAPI (amap-jsapi-skill) 规范：
 * 1. 距离 <= 3000 米：优先使用 AMap.Walking 步行路线规划
 * 2. 距离 > 3000 米（或步行规划失败）：自动调用 AMap.Driving 驾车规划，彻底修复远距离/跨区/跨城无法显示导航的 bug
 * 3. 极远无路网兜底：绘制高亮高德 Polyline 路径，确保 100% 显示导航路线
 * 4. 纯净导航体验：无需冗长琐碎的分步文字说明，聚焦地图核心路径与总里程耗时
 */
const drawNavigationRoute = async () => {
  if (!mapInstance || !activity.value || !userLocation.value) return
  const AMap = window.AMap
  if (!AMap) return

  const userLng = Number(userLocation.value.longitude)
  const userLat = Number(userLocation.value.latitude)
  const actLng = Number(activity.value.longitude)
  const actLat = Number(activity.value.latitude)
  if (!isValidCoordinatePair(userLng, userLat) || !isValidCoordinatePair(actLng, actLat)) return

  const currentReqId = ++routeRequestId
  clearRouteLayers()

  const startPos = new AMap.LngLat(userLng, userLat)
  const endPos = new AMap.LngLat(actLng, actLat)
  const distMeters = getAMapDistance(userLat, userLng, actLat, actLng)

  // 辅助函数：绘制直连备用航线 (Polyline)
  const drawDirectFallbackPolyline = () => {
    if (currentReqId !== routeRequestId || !mapInstance) return
    clearRouteLayers()
    const distStr = distMeters < 1000 ? `${distMeters}米` : `${(distMeters / 1000).toFixed(1)}公里`
    const mins = Math.max(1, Math.round(distMeters / 600))
    const durStr = mins > 60 ? `${Math.floor(mins / 60)}小时${mins % 60}分钟` : `${mins} 分钟`

    directLineInstance = new AMap.Polyline({
      path: [startPos, endPos],
      strokeColor: '#2563eb',
      strokeWeight: 6,
      strokeOpacity: 0.85,
      strokeStyle: 'dashed',
      strokeDasharray: [10, 8],
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 50
    })
    mapInstance.add(directLineInstance)
    navRouteInfo.value = {
      distance: distStr,
      duration: durStr,
      mode: 'direct',
      modeName: '直线'
    }
    try {
      mapInstance.setFitView([myMarkerInstance, endMarkerInstance, directLineInstance].filter(Boolean), false, [60, 60, 60, 60])
    } catch {}
  }

  // 驾车规划逻辑（支持任意远距离、跨区跨城长途路线）
  const runDrivingPlan = (): Promise<void> => {
    return new Promise((resolve) => {
      AMap.plugin('AMap.Driving', () => {
        if (currentReqId !== routeRequestId || !mapInstance) {
          resolve()
          return
        }
        const driving = new AMap.Driving({
          map: mapInstance,
          hideMarkers: true,
          showTraffic: false
        })
        drivingRouteInstance = driving

        driving.search(startPos, endPos, (status: string, result: any) => {
          if (currentReqId !== routeRequestId || !mapInstance) {
            resolve()
            return
          }
          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const route = result.routes[0]
            const dMeters = route.distance || distMeters
            const durationSec = route.time || 0
            const distStr = dMeters < 1000 ? `${dMeters}米` : `${(dMeters / 1000).toFixed(1)}公里`
            const durationMin = Math.max(1, Math.round(durationSec / 60))
            const durStr = durationMin > 60 ? `${Math.floor(durationMin / 60)}小时${durationMin % 60}分钟` : `${durationMin} 分钟`

            navRouteInfo.value = {
              distance: distStr,
              duration: durStr,
              mode: 'drive',
              modeName: '驾车'
            }
            try {
              mapInstance.setFitView(null, false, [60, 60, 60, 60])
            } catch {}
            resolve()
          } else {
            console.warn('高德驾车路线规划返回无数据，降级为直连航线:', status, result)
            drawDirectFallbackPolyline()
            resolve()
          }
        })
      })
    })
  }

  // 步行规划逻辑（适合 3km 以内短途）
  const runWalkingPlan = (): Promise<void> => {
    return new Promise((resolve) => {
      AMap.plugin('AMap.Walking', () => {
        if (currentReqId !== routeRequestId || !mapInstance) {
          resolve()
          return
        }
        const walking = new AMap.Walking({
          map: mapInstance,
          hideMarkers: true
        })
        walkingRouteInstance = walking

        walking.search(startPos, endPos, (status: string, result: any) => {
          if (currentReqId !== routeRequestId || !mapInstance) {
            resolve()
            return
          }
          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const route = result.routes[0]
            const dMeters = route.distance || distMeters
            const durationSec = route.time || 0
            const distStr = dMeters < 1000 ? `${dMeters}米` : `${(dMeters / 1000).toFixed(1)}公里`
            const durationMin = Math.max(1, Math.round(durationSec / 60))
            const durStr = durationMin > 60 ? `${Math.floor(durationMin / 60)}小时${durationMin % 60}分钟` : `${durationMin} 分钟`

            navRouteInfo.value = {
              distance: distStr,
              duration: durStr,
              mode: 'walk',
              modeName: '步行'
            }
            try {
              mapInstance.setFitView(null, false, [60, 60, 60, 60])
            } catch {}
            resolve()
          } else {
            // 步行规划因超距或无路网失败，自动平滑升级为驾车规划
            console.warn('步行路线规划失败，自动升级为驾车导航规划:', status)
            runDrivingPlan().then(resolve)
          }
        })
      })
    })
  }

  // 距离超 3000 米时直接调用驾车规划；3000 米以内优先步行
  if (distMeters > 3000) {
    await runDrivingPlan()
  } else {
    await runWalkingPlan()
  }
}

/**
 * 视角复位到“我的位置”
 */
const focusMyLocation = () => {
  if (!mapInstance) return
  if (!userLocation.value) {
    refreshUserLocation(false).then((success) => {
      if (success && mapInstance && userLocation.value) {
        mapInstance.setZoomAndCenter(17, [Number(userLocation.value.longitude), Number(userLocation.value.latitude)])
      }
    })
    return
  }
  mapInstance.setZoomAndCenter(17, [Number(userLocation.value.longitude), Number(userLocation.value.latitude)])
}

/**
 * 视角适应完整路线
 */
const focusFullRoute = () => {
  if (!mapInstance) return
  mapInstance.setFitView(null, false, [60, 60, 60, 60])
}

/**
 * 启动实时位置追踪（高德融合定位轮询，确保 GCJ-02 真实坐标系）
 */
const startLocationTracking = () => {
  stopLocationTracking()
  locationRefreshTimer = setInterval(() => {
    if (isNavigating.value && !locatingUser.value) {
      refreshUserLocation(true)
    }
  }, 10000)
}

/**
 * 停止实时位置追踪
 */
const stopLocationTracking = () => {
  if (locationRefreshTimer !== null) {
    clearInterval(locationRefreshTimer)
    locationRefreshTimer = null
  }
}

/**
 * 销毁地图实例
 */
const destroyMap = () => {
  if (navigationInitTimer !== null) {
    clearTimeout(navigationInitTimer)
    navigationInitTimer = null
  }
  routeRequestId += 1
  clearRouteLayers()
  if (myMarkerInstance && mapInstance) {
    try { mapInstance.remove(myMarkerInstance) } catch {}
  }
  myMarkerInstance = null
  if (endMarkerInstance && mapInstance) {
    try { mapInstance.remove(endMarkerInstance) } catch {}
  }
  endMarkerInstance = null
  if (fenceCircleInstance && mapInstance) {
    try { mapInstance.remove(fenceCircleInstance) } catch {}
  }
  fenceCircleInstance = null
  if (mapInstance) {
    try {
      mapInstance.destroy()
    } catch {}
    mapInstance = null
  }
  navRouteInfo.value = null
}

const refreshing = ref(false)

/**
 * 获取活动详情
 * @param silent 是否静默刷新（下拉刷新时不阻断页面、不闪烁加载框）
 */
const fetchDetail = async (silent = false) => {
  if (!activityId.value) return
  if (!silent && !activity.value) {
    loading.value = true
  }
  try {
    const res = await getActivityDetailApi(activityId.value)
    activity.value = res
    if (userLocation.value && isValidCoordinatePair(res.longitude, res.latitude)) {
      distanceToActivity.value = getAMapDistance(
        userLocation.value.latitude,
        userLocation.value.longitude,
        res.latitude,
        res.longitude
      )
    }
  } catch (err: any) {
    if (!silent) {
      uni.showToast({ title: err.message || '获取活动详情失败', icon: 'none' })
    }
  } finally {
    if (!silent) {
      loading.value = false
    }
    uni.stopPullDownRefresh()
  }
}

/**
 * 手动点击刷新活动数据与最新名额
 */
const handleManualRefresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await fetchDetail(true)
    uni.showToast({ title: '已刷新活动最新数据', icon: 'none' })
  } finally {
    refreshing.value = false
  }
}



// 报名状态与人数进度计算
const enrolledCount = computed(() => {
  if (!activity.value) return 0
  const raw = (activity.value as any).participantCount !== undefined ? (activity.value as any).participantCount : activity.value.enrolledCount
  return raw !== undefined && raw !== null ? Number(raw) : 0
})

const isFull = computed(() => {
  return isActivityFull(activity.value)
})

const progressPercent = computed(() => {
  if (!activity.value || !activity.value.registrationLimit || activity.value.registrationLimit <= 0) return 0
  return Math.min(100, Math.round((enrolledCount.value / activity.value.registrationLimit) * 100))
})

const myStatus = computed(() => activity.value?.myEnrollmentStatus || 'NONE')
const statusInfo = computed(() => getActivityStatusInfo(activity.value))

// 底部按钮操作调度（根据活动状态执行相应功能）
const handleDetailAction = () => {
  if (!activity.value || submitting.value || statusInfo.value.disabled) return
  if (statusInfo.value.actionType === 'CHECKIN') {
    goToCheckin()
    return
  }
  if (statusInfo.value.actionType === 'WAIT_START') {
    uni.showToast({ title: '活动尚未开展，请于活动进行期间前往现场扫码打卡', icon: 'none' })
    return
  }
  if (statusInfo.value.actionType === 'SIGNUP' || statusInfo.value.actionType === 'WAITLIST') {
    handleEnrollAction()
    return
  }
}

// 处理报名或候补申请
const handleEnrollAction = async () => {
  if (!activity.value || submitting.value) return
  const act = activity.value

  if (myStatus.value === 'COMPLETED') {
    uni.showToast({ title: '您已完成本次活动打卡考勤', icon: 'none' })
    return
  }

  if (myStatus.value === 'ENROLLED') {
    uni.navigateTo({
      url: `/pages/activity/checkin?actId=${act.id}`
    })
    return
  }

  if (myStatus.value === 'WAITLIST') {
    handleCancelSignup()
    return
  }

  if (isFull.value) {
    if (!act.waitlistEnabled) {
      uni.showToast({ title: '名额已满额，且未开放候补排队', icon: 'none' })
      return
    }
    const nextQ = (act.waitlistCount || 0) + 1
    uni.showModal({
      title: '候补申请确认',
      content: `正选名额已满，确认进入候补队列吗？\n当前排队序号预估为第 ${nextQ} 位。若有已报名同学退报，系统将自动顺延递补。`,
      confirmText: '确认候补',
      cancelText: '取消',
      success: async (mRes) => {
        if (!mRes.confirm) return
        submitting.value = true
        try {
          const res = await signupActivityApi(act.id)
          uni.showToast({ title: res?.message || '候补申请成功', icon: 'success' })
          fetchDetail(true)
        } catch (err: any) {
          uni.showToast({ title: getApiErrorMessage(err, '候补申请失败'), icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
  } else {
    uni.showModal({
      title: '确认报名活动',
      content: `确认报名「${act.title}」吗？\n出勤完成后可获得 +${act.points} 积分奖励。`,
      confirmText: '立即报名',
      cancelText: '取消',
      success: async (mRes) => {
        if (!mRes.confirm) return
        submitting.value = true
        try {
          const res = await signupActivityApi(act.id)
          uni.showToast({ title: res?.message || '报名成功', icon: 'success' })
          fetchDetail(true)
        } catch (err: any) {
          uni.showToast({ title: getApiErrorMessage(err, '报名失败'), icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
  }
}

// 主动取消报名或退出候补
const handleCancelSignup = () => {
  if (!activity.value || submitting.value) return
  const act = activity.value
  const isWait = myStatus.value === 'WAITLIST'

  promptCancelSignupModal({
    title: act.title,
    isWaitlist: isWait,
    onConfirm: async () => {
      submitting.value = true
      try {
        const message = await cancelSignupActivityApi(act.id)
        uni.showToast({ title: message || (isWait ? '已退出候补队列' : '已取消报名，名额已释放'), icon: 'success' })
        fetchDetail(true)
      } catch (err: any) {
        uni.showToast({ title: getApiErrorMessage(err, isWait ? '退出候补失败' : '取消失败'), icon: 'none' })
      } finally {
        submitting.value = false
      }
    }
  })
}

const goToCheckin = () => {
  if (!activity.value) return
  uni.navigateTo({
    url: `/pages/activity/checkin?actId=${activity.value.id}`
  })
}

onLoad((query: any) => {
  if (query && query.id) {
    activityId.value = Number(query.id)
  }
  fetchDetail()
})

onPullDownRefresh(async () => {
  await fetchDetail(true)
  uni.stopPullDownRefresh()
  uni.showToast({ title: '已刷新活动数据', icon: 'none' })
})

onShow(() => {
  // 页面重新展示时，若处于导航模式则恢复定位追踪轮询
  if (isNavigating.value) {
    startLocationTracking()
  }
  // 页面重新展示时静默刷新：从打卡页返回后报名/打卡状态必须同步，不能继续显示旧状态
  if (activityId.value) {
    fetchDetail(true)
  }
})

onHide(() => {
  // 离开当前页面（如跳转至打卡页）时立即暂停定位追踪轮询，防止后台持续占用资源
  stopLocationTracking()
})

onUnload(() => {
  stopLocationTracking()
  destroyMap()
})

onUnmounted(() => {
  stopLocationTracking()
  destroyMap()
})
</script>

<template>
  <view class="detail-page-shell">
    <view v-if="activity" class="detail-content">
      <!-- 头部 Hero (深蓝旗舰渐变) -->
      <view class="detail-hero-box">
        <view class="hero-tag-row">
          <text v-if="activity.categoryName" class="hero-tag tag-primary">{{ activity.categoryName }}</text>
          <text class="hero-tag" :class="`tag-status-${statusInfo.statusType}`">
            {{ statusInfo.statusLabel }}
          </text>
          <text v-if="activity.certificateEnabled" class="hero-tag tag-warning">颁发结业证书</text>
          <view class="manual-refresh-pill" title="点击刷新活动名额与状态" @click="handleManualRefresh">
            <svg class="refresh-pill-svg" :class="{ spinning: refreshing }" viewBox="0 0 24 24">
              <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            <text class="refresh-pill-text">刷新名额</text>
          </view>
        </view>
        <view class="hero-title">{{ activity.title }}</view>
        <!-- 后端无主办单位字段，certificateIssuer 是证书签发方，不得冒充主办单位 -->
        <view v-if="activity.certificateIssuer" class="hero-organizer">
          证书签发单位：{{ activity.certificateIssuer }}
        </view>
      </view>

      <!-- 核心信息卡片 -->
      <view class="detail-body-container">
        <!-- 积分与名额双指标卡片 (增加直观报名进度条) -->
        <view class="uni-card quota-points-card">
          <view class="quota-points-row">
            <view class="quota-points-left">
              <view class="meta-label">完成出勤奖励积分</view>
              <view class="meta-points-val">
                +{{ activity.points }}
                <text class="pts-unit">积分</text>
              </view>
            </view>
            <view class="quota-points-right">
              <view class="meta-label">正选名额状态</view>
              <view class="quota-number-line">
                <!-- registrationLimit <= 0 表示不限名额，不能显示成 "12 / 0" -->
                <template v-if="activity.registrationLimit > 0">
                  {{ enrolledCount }} / {{ activity.registrationLimit }}
                  <text v-if="isFull && activity.waitlistEnabled" class="badge-waitlist">可候补</text>
                  <text v-else-if="isFull" class="badge-full">已满额</text>
                  <text v-else-if="activity.registrationLimit - enrolledCount <= 5" class="badge-available">仅剩 {{ activity.registrationLimit - enrolledCount }} 个名额</text>
                  <text v-else class="badge-available">名额充裕</text>
                </template>
                <template v-else>
                  已报 {{ enrolledCount }}
                  <text class="badge-available">不限名额</text>
                </template>
              </view>
            </view>
          </view>

          <!-- 直观报名进度条 -->
          <view v-if="activity.registrationLimit > 0" class="detail-progress-wrap">
            <view class="detail-progress-track">
              <view
                class="detail-progress-fill"
                :class="{ full: isFull }"
                :style="{ width: `${progressPercent}%` }"
              />
            </view>
            <view class="detail-progress-info">
              <text class="progress-sub">已报 {{ enrolledCount }} / 额定 {{ activity.registrationLimit }} 人</text>
              <text class="progress-percent" :class="{ 'full-text': isFull }">{{ progressPercent }}%</text>
            </view>
          </view>
          <view v-else class="detail-progress-wrap">
            <view class="detail-progress-info">
              <text class="progress-sub">本活动不限参与人数，报名即可参与</text>
            </view>
          </view>
        </view>

        <!-- 我的参与状态提示条 (SVG 图标替代 Emoji) -->
        <view v-if="myStatus !== 'NONE'" class="my-status-banner" :class="`banner-${myStatus}`">
          <view v-if="myStatus === 'ENROLLED'" class="status-tip-row">
            <svg class="tip-svg tip-svg-success" viewBox="0 0 24 24">
              <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M10,17L16.59,10.41L15.17,9L10,14.17L7.83,12L6.41,13.41L10,17Z"/>
            </svg>
            <view class="tip-text-box">
              <view class="tip-strong">您已正式报名成功！</view>
              <view class="tip-desc">请于活动开始前到达现场，开启定位扫码核验出勤。</view>
            </view>
            <view class="tip-action-btn" @click="handleCancelSignup">退报</view>
          </view>
          <view v-else-if="myStatus === 'WAITLIST'" class="status-tip-row">
            <svg class="tip-svg tip-svg-warning" viewBox="0 0 24 24">
              <path d="M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z"/>
            </svg>
            <view class="tip-text-box">
              <view class="tip-strong">
                {{ activity.myQueueNumber ? `正在候补排队中（当前排第 ${activity.myQueueNumber} 位）` : '正在候补排队中（排位同步中）' }}
              </view>
              <view class="tip-desc">正选同学退报后，系统将自动顺延递补并提醒。</view>
            </view>
          </view>
          <view v-else-if="myStatus === 'COMPLETED'" class="status-tip-row">
            <svg class="tip-svg tip-svg-completed" viewBox="0 0 24 24">
              <path d="M19,5H18V3H6V5H5C3.9,5 3,5.9 3,7V8C3,10.55 4.92,12.63 7.39,12.93C8.15,14.25 9.47,15.19 11,15.46V18H8V20H16V18H13V15.46C14.53,15.19 15.85,14.25 16.61,12.93C19.08,12.63 21,10.55 21,8V7C21,5.9 20.1,5 19,5M5,8V7H6V10.7C5.38,10.21 5,9.46 5,8M19,8C19,9.46 18.62,10.21 18,10.7V7H19V8Z"/>
            </svg>
            <view class="tip-text-box">
              <view class="tip-strong">已完成本次活动打卡！</view>
              <view class="tip-desc">+{{ activity.points }} 积分已即时入账至可用积分余额。</view>
            </view>
          </view>
        </view>

        <!-- 起止时间与地点 -->
        <view class="uni-card meta-info-card">
          <view class="meta-cell">
            <svg class="cell-svg" viewBox="0 0 24 24">
              <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
            </svg>
            <view class="cell-content">
              <view class="cell-title">起止时间</view>
              <view class="cell-desc">
                {{ activity.startTime }} 至 {{ activity.endTime }}
              </view>
            </view>
          </view>

          <view class="meta-cell meta-cell-location">
            <svg class="cell-svg" viewBox="0 0 24 24">
              <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
            </svg>
            <view class="cell-content">
              <view class="cell-header-line">
                <view class="cell-title">活动地点与考勤围栏</view>
                <!-- 导航前往胶囊按钮 -->
                <view
                  class="nav-trigger-capsule"
                  :class="{ 'nav-active': isNavigating }"
                  @click="toggleNavigation"
                >
                  <svg class="nav-capsule-svg" viewBox="0 0 24 24">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                  </svg>
                  <text class="nav-capsule-text">{{ isNavigating ? '结束导航' : '开始导航' }}</text>
                </view>
              </view>
              <view class="cell-desc">
                {{ activity.locationName }}
                <text v-if="activity.locationCheckEnabled">
                  （打卡范围: ≤ {{ activity.locationRadius }}米）
                </text>
              </view>
              <view v-if="activity.locationAddress" class="cell-sub-address">
                {{ activity.locationAddress }}
              </view>
            </view>
          </view>

          <!-- 学生当前定位与实时测距状态条 -->
          <view class="location-distance-banner" :class="{ 'in-fence': hasUserDistance && isWithinFence, 'out-fence': hasUserDistance && !isWithinFence }">
            <view class="dist-status-left">
              <view class="status-pulse-dot" :class="{ 'pulse-green': hasUserDistance && isWithinFence, 'pulse-blue': !hasUserDistance || !isWithinFence }" />
              <view class="dist-status-texts">
                <view v-if="locatingUser" class="dist-status-main">
                  高德正在定位当前位置...
                </view>
                <template v-else>
                  <view v-if="!hasUserDistance" class="dist-status-main blue-text">
                    尚未获取当前位置，点击刷新或开始导航后授权定位
                  </view>
                  <view v-else-if="isWithinFence" class="dist-status-main green-text">
                    已进入打卡核验范围 (距打卡点约 {{ formattedDistance }})
                  </view>
                  <view v-else class="dist-status-main blue-text">
                    距活动打卡点约 {{ formattedDistance }} · 步行约 {{ estimatedDuration }}
                  </view>
                </template>
                <view class="dist-status-sub">
                  我的定位: {{ userLocation?.formattedAddress || '尚未获取，请允许定位权限后刷新' }}
                </view>
              </view>
            </view>
            <view class="dist-refresh-btn" @click.stop="refreshUserLocation(false)">
              <svg class="refresh-svg-icon" :class="{ spinning: locatingUser }" viewBox="0 0 24 24">
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </view>
          </view>

          <!-- 内嵌高德步行导航地图（展开即在当前页面开始实时导航） -->
          <view v-if="navMapVisible" class="inline-nav-map-section">
            <!-- 导航状态顶栏 HUD -->
            <view class="nav-hud-header">
              <view class="nav-hud-status">
                <view class="nav-live-dot" />
                <text class="nav-hud-title">{{ navRouteInfo ? `${navRouteInfo.modeName}导航中` : '正在规划路线' }}</text>
              </view>
              <view class="nav-hud-actions">
                <view class="nav-hud-amap-btn" title="呼起高德地图官方 App / Web 详细路线规划" @click="openExternalNav">
                  <svg class="hud-amap-svg" viewBox="0 0 24 24">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                  </svg>
                  <text>高德导航</text>
                </view>
                <view class="nav-hud-stop-btn" @click="stopNavigation">
                  <svg class="hud-stop-svg" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                  <text>结束</text>
                </view>
              </view>
            </view>

            <!-- 地图容器与浮动控制 -->
            <view class="inline-map-wrapper">
              <view v-if="navMapLoading" class="map-loading-overlay">
                <view class="map-loading-spinner" />
                <text class="map-loading-text">正在规划导航路线...</text>
              </view>
              <view id="nav-inline-map" class="inline-map-canvas" />

              <!-- 地图浮动工具按钮：我的位置 / 全览 -->
              <view class="map-floating-controls">
                <view class="map-float-btn" title="我的位置" @click="focusMyLocation">
                  <svg class="float-btn-svg" viewBox="0 0 24 24">
                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                  </svg>
                </view>
                <view class="map-float-btn" title="路线全览" @click="focusFullRoute">
                  <svg class="float-btn-svg" viewBox="0 0 24 24">
                    <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/>
                  </svg>
                </view>
              </view>
            </view>

            <!-- 路线信息卡片（聚焦地图核心路径与总里程耗时，无需冗余步骤文字） -->
            <view v-if="navRouteInfo" class="nav-guidance-card">
              <view class="nav-guide-top">
                <view class="nav-guide-target">
                  <app-icon name="map-pin" :size="30" color="#2563eb" />
                  <text class="guide-target-name">{{ activity.locationName || '活动打卡点' }}</text>
                </view>
                <view class="nav-guide-stats">
                  <text class="guide-stat-mode">{{ navRouteInfo.modeName }}约 {{ navRouteInfo.duration }}</text>
                  <text class="guide-stat-dot">·</text>
                  <text class="guide-stat-dist">全程 {{ navRouteInfo.distance }}</text>
                </view>
              </view>
              <view class="nav-route-status-bar">
                <svg class="route-ready-svg" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <text class="route-ready-text">导航路线已就绪并在地图中高亮展示</text>
              </view>
            </view>
          </view>

          <!-- 科技风 GPS 雷达围栏模拟预览 -->
          <view v-if="activity.locationCheckEnabled && !navMapVisible" class="gps-radar-preview">
            <view class="radar-circle">
              <view class="radar-ping-ring" />
              <text class="radar-text">核验半径 {{ activity.locationRadius }}m</text>
            </view>
            <view class="radar-center-marker">
              <svg class="marker-svg" viewBox="0 0 24 24">
                <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
              </svg>
            </view>
            <!-- 雷达卡片底部导航快捷入口 -->
            <view class="radar-quick-nav-bar" @click="toggleNavigation">
              <text class="quick-nav-label">不知道怎么走？</text>
              <view class="quick-nav-link">
                开始步行导航
                <svg class="quick-arrow-svg" viewBox="0 0 24 24">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
              </view>
            </view>
          </view>
        </view>

        <!-- 活动规则与大纲介绍 -->
        <view class="uni-card outline-card">
          <view class="card-section-title">活动大纲与内容介绍</view>
          <view class="section-paragraph">
            {{ activity.description || '暂无详细介绍说明。' }}
          </view>

          <view class="attendance-notice-box">
            <view class="notice-title">
              <svg class="notice-svg" viewBox="0 0 24 24">
                <path d="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z"/>
              </svg>
              出勤考勤须知
            </view>
            <view class="notice-content">
              {{ activity.ruleDescription || (activity.locationCheckEnabled ? `现场大屏将展示动态防盗刷二维码（每10秒自动轮换），学生到达现场在 ${activity.locationRadius} 米定位范围内扫码即可完成出勤核验。` : '现场大屏将展示动态防盗刷二维码（每10秒自动轮换），学生到达现场扫码即可完成出勤核验。') }}
            </view>
          </view>
        </view>
      </view>

      <!-- 底部固定操作栏 (按钮显式显示当前活动状态并区分对应功能) -->
      <view class="bottom-fix-bar">
        <template v-if="statusInfo.canCancel">
          <button
            class="enroll-btn"
            :class="myStatus === 'WAITLIST' ? 'btn-warning-outline' : 'btn-danger-outline'"
            :disabled="submitting"
            @click="handleCancelSignup"
          >
            {{ statusInfo.cancelButtonText }}
          </button>
        </template>

        <button
          class="enroll-btn"
          :class="statusInfo.buttonClass"
          :disabled="statusInfo.disabled || submitting"
          @click="handleDetailAction"
        >
          {{ statusInfo.buttonText }}
        </button>
      </view>
    </view>

    <!-- 加载中状态 -->
    <view v-else-if="loading" class="detail-state-card">
      <view class="detail-state-spinner" />
      <text class="detail-state-text">正在加载活动信息...</text>
    </view>

    <!-- 活动未找到/加载失败提示 -->
    <view v-else class="detail-state-card">
      <app-icon name="alert-circle" :size="88" color="#94a3b8" stroke-width="1.5" />
      <text class="detail-state-text">未找到该活动信息或活动已下线</text>
      <button class="detail-retry-btn" @click="fetchDetail(false)">重新加载</button>
    </view>
  </view>
</template>

<style scoped>
.detail-page-shell {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 128rpx;
}

/* 加载中与空状态卡片 */
.detail-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 160rpx 40rpx;
  gap: 20rpx;
}

.detail-state-spinner {
  width: 56rpx;
  height: 56rpx;
  border: 4rpx solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spinLoading 0.8s linear infinite;
}

@keyframes spinLoading {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.detail-state-icon {
  font-size: 64rpx;
  margin-bottom: 8rpx;
}

.detail-state-text {
  font-size: 26rpx;
  color: #64748b;
}

.detail-retry-btn {
  margin-top: 20rpx;
  font-size: 24rpx;
  padding: 8rpx 36rpx;
  background-color: #2563eb;
  color: #ffffff;
  border-radius: 999rpx;
  border: none;
}

/* 头部 Hero */
.detail-hero-box {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  color: #ffffff;
  padding: 36rpx 28rpx 40rpx;
}

.hero-tag-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.hero-tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-weight: 500;
}

.tag-primary {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.tag-warning {
  background-color: #f59e0b;
  color: #ffffff;
}

/* 手动刷新胶囊按键 */
.manual-refresh-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  margin-left: auto;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.manual-refresh-pill:active {
  transform: scale(0.94);
  background: rgba(255, 255, 255, 0.35);
}

.refresh-pill-svg {
  width: 22rpx;
  height: 22rpx;
  fill: #ffffff;
}

.refresh-pill-text {
  font-size: 20rpx;
  color: #ffffff;
  font-weight: 500;
}

.hero-title {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 12rpx;
}

.hero-organizer {
  font-size: 24rpx;
  color: #cbd5e1;
}

/* 详情卡片容器 */
.detail-body-container {
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.uni-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 1px solid #e2e8f0;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.02);
}

/* 积分与名额指标 */
.quota-points-card {
  display: flex;
  flex-direction: column;
}

.quota-points-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-label {
  font-size: 22rpx;
  color: #64748b;
  margin-bottom: 4rpx;
}

.meta-points-val {
  font-size: 44rpx;
  font-weight: 700;
  color: #f59e0b;
  line-height: 1;
}

.pts-unit {
  font-size: 24rpx;
  font-weight: normal;
  color: #64748b;
  margin-left: 6rpx;
}

.quota-points-right {
  text-align: right;
}

.quota-number-line {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 6rpx;
}

.badge-available {
  background-color: #ecfdf5;
  color: #10b981;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #c2e7b0;
}

.badge-waitlist {
  background-color: #fffbeb;
  color: #f59e0b;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #f5dab1;
}

.badge-full {
  background-color: #f4f4f5;
  color: #64748b;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #e9e9eb;
}

/* 详情页报名进度条 */
.detail-progress-wrap {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f2f3f5;
}

.detail-progress-track {
  height: 10rpx;
  background-color: #f0f2f5;
  border-radius: 5rpx;
  overflow: hidden;
}

.detail-progress-fill {
  height: 100%;
  background-color: #2563eb;
  border-radius: 5rpx;
  transition: width 0.3s ease;
}

.detail-progress-fill.full {
  background-color: #f59e0b;
}

.detail-progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #64748b;
}

.progress-sub {
  color: #475569;
}

.progress-percent {
  font-weight: 700;
  color: #2563eb;
}

.progress-percent.full-text {
  color: #f59e0b;
}

/* 我的报名状态提示 */
.my-status-banner {
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
}

.banner-ENROLLED {
  background-color: #eff6ff;
  border: 1px solid #b3d8ff;
  color: #2563eb;
}

.banner-WAITLIST {
  background-color: #fffbeb;
  border: 1px solid #faecd8;
  color: #f59e0b;
}

.banner-COMPLETED {
  background-color: #ecfdf5;
  border: 1px solid #c2e7b0;
  color: #10b981;
}

.status-tip-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.tip-svg {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
}

.tip-svg-success { fill: #2563eb; }
.tip-svg-warning { fill: #f59e0b; }
.tip-svg-completed { fill: #10b981; }

.tip-text-box {
  flex: 1;
}

.tip-strong {
  font-size: 26rpx;
  font-weight: 700;
}

.tip-desc {
  font-size: 22rpx;
  opacity: 0.88;
  margin-top: 4rpx;
}

.tip-action-btn {
  font-size: 22rpx;
  color: #ef4444;
  border: 1px solid #fbc4c4;
  background-color: #ffffff;
  padding: 6rpx 18rpx;
  border-radius: 8rpx;
  font-weight: 500;
}

/* 单元格信息 */
.meta-info-card {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.meta-cell {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.cell-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #64748b;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.cell-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e293b;
}

.cell-desc {
  font-size: 24rpx;
  color: #475569;
  margin-top: 4rpx;
}

/* GPS 雷达围栏模拟预览 */
.gps-radar-preview {
  width: 100%;
  min-height: 320rpx;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12rpx;
  margin-top: 10rpx;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 16rpx;
  box-sizing: border-box;
  overflow: hidden;
  background-image: radial-gradient(#cbd5e1 1.5px, transparent 1.5px);
  background-size: 28rpx 28rpx;
}

.radar-circle {
  width: 210rpx;
  height: 210rpx;
  border-radius: 50%;
  border: 2rpx dashed #2563eb;
  background-color: rgba(64, 158, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.radar-text {
  font-size: 20rpx;
  color: #2563eb;
  font-weight: 600;
}

.radar-center-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -85%);
  z-index: 10;
}

.marker-svg {
  width: 36rpx;
  height: 36rpx;
  fill: #ef4444;
}


/* 大纲与出勤须知 */
.card-section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 14rpx;
}

.section-paragraph {
  font-size: 26rpx;
  color: #475569;
  line-height: 1.7;
}

.attendance-notice-box {
  margin-top: 20rpx;
  padding: 20rpx;
  background-color: #fffbeb;
  border-radius: 8rpx;
  border: 1px solid #faecd8;
}

.notice-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #f59e0b;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
}

.notice-svg {
  width: 28rpx;
  height: 28rpx;
  fill: #f59e0b;
}

.notice-content {
  font-size: 23rpx;
  color: #64748b;
  line-height: 1.5;
}

/* 底部固定操作栏 */
.bottom-fix-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 104rpx;
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
  gap: 16rpx;
  z-index: 100;
  box-sizing: border-box;
}

.enroll-btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  color: #ffffff;
  transition: all 0.15s ease;
}

.enroll-btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background-color: #2563eb;
}

.btn-warning {
  background-color: #f59e0b;
}

.btn-success {
  background-color: #10b981;
}

.btn-secondary {
  background-color: #fef2f2;
  border: 1px solid #fbc4c4;
  color: #ef4444;
  flex: 0 0 200rpx;
}

.btn-danger-outline {
  background-color: #fef2f2;
  border: 1px solid #fbc4c4;
  color: #ef4444;
  flex: 0 0 190rpx;
}

.btn-enrolled-disabled {
  background-color: #e2e8f0 !important;
  border: 1px solid #e2e8f0 !important;
  color: #64748b !important;
  cursor: not-allowed;
  flex: 0 0 160rpx;
}

.btn-warning-outline {
  background-color: #fffbeb;
  border: 1px solid #faecd8;
  color: #f59e0b;
  flex: 0 0 190rpx;
}

.btn-warning-disabled {
  background-color: #faecd8 !important;
  border: 1px solid #f5dab1 !important;
  color: #f59e0b !important;
  cursor: not-allowed;
}

.btn-disabled {
  background-color: #cbd5e1;
}

.btn-success-disabled {
  background-color: #ecfdf5 !important;
  border: 1px solid #c2e7b0 !important;
  color: #10b981 !important;
  cursor: not-allowed;
}

.btn-info-outline {
  background-color: #f4f4f5 !important;
  border: 1px solid #e2e8f0 !important;
  color: #475569 !important;
}

.tag-status-success {
  background-color: #10b981;
  color: #ffffff;
}

.tag-status-warning {
  background-color: #f59e0b;
  color: #ffffff;
}

.tag-status-info {
  background-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

/* 已报名等主色态徽章（此前缺失导致徽章只剩裸白字） */
.tag-status-primary {
  background-color: #3b82f6;
  color: #ffffff;
}

.tag-status-danger {
  background-color: #ef4444;
  color: #ffffff;
}

/* ================= 地图导航与定位测距样式 ================= */

.cell-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.cell-sub-address {
  font-size: 22rpx;
  color: #64748b;
  margin-top: 6rpx;
  line-height: 1.4;
}

/* 一键导航胶囊按钮 */
.nav-trigger-capsule {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  box-shadow: 0 4rpx 12rpx rgba(37, 99, 235, 0.28);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.nav-trigger-capsule:active {
  transform: scale(0.95);
  box-shadow: 0 2rpx 6rpx rgba(37, 99, 235, 0.2);
}

.nav-trigger-capsule.nav-active {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 4rpx 14rpx rgba(239, 68, 68, 0.35);
}

.nav-capsule-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #ffffff;
}

.nav-capsule-text {
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}

/* 学生当前定位与距离测算横幅 */
.location-distance-banner {
  margin-top: 18rpx;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.location-distance-banner.in-fence {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.location-distance-banner.out-fence {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.dist-status-left {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex: 1;
  min-width: 0;
}

.status-pulse-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.pulse-green {
  background: #10b981;
  box-shadow: 0 0 10rpx #10b981;
  animation: pulseGreenAnim 2s infinite ease-in-out;
}

.pulse-blue {
  background: #3b82f6;
  box-shadow: 0 0 10rpx #3b82f6;
  animation: pulseBlueAnim 2s infinite ease-in-out;
}

@keyframes pulseGreenAnim {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 16rpx #059669; }
}

@keyframes pulseBlueAnim {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 16rpx #2563eb; }
}

.dist-status-texts {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
  min-width: 0;
}

.dist-status-main {
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.35;
}

.green-text {
  color: #15803d;
}

.blue-text {
  color: #1d4ed8;
}

.dist-status-sub {
  font-size: 20rpx;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dist-refresh-btn {
  padding: 8rpx;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-svg-icon {
  width: 32rpx;
  height: 32rpx;
  fill: #64748b;
  transition: transform 0.2s ease;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 雷达底部快捷导航条 */
.radar-quick-nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(10px);
  border-radius: 8rpx;
  padding: 12rpx 20rpx;
  margin-top: 16rpx;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 0.2s ease;
}

.radar-quick-nav-bar:active {
  background: rgba(15, 23, 42, 0.8);
}

.quick-nav-label {
  font-size: 22rpx;
  color: #94a3b8;
}

.quick-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  font-size: 22rpx;
  color: #38bdf8;
  font-weight: 500;
}

.quick-arrow-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #38bdf8;
}

/* ================= 内嵌导航地图样式 ================= */

.inline-nav-map-section {
  margin-top: 18rpx;
  border-radius: 16rpx;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  animation: mapExpand 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes mapExpand {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 800rpx; }
}

.inline-map-wrapper {
  position: relative;
  width: 100%;
  height: 420rpx;
  background: #f1f5f9;
}

.inline-map-canvas {
  width: 100%;
  height: 100%;
}

.map-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(241, 245, 249, 0.9);
  z-index: 10;
  gap: 12rpx;
}

.map-loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.map-loading-text {
  font-size: 24rpx;
  color: #64748b;
}

/* 步行路线信息与导航HUD样式 */
.inline-nav-map-section {
  margin-top: 18rpx;
  border-radius: 16rpx;
  overflow: hidden;
  border: 1px solid #bfdbfe;
  box-shadow: 0 8rpx 24rpx rgba(37, 99, 235, 0.08);
  animation: mapExpand 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 导航状态 HUD 顶栏 */
.nav-hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 20rpx;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #ffffff;
}

.nav-hud-status {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.nav-live-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 10rpx #10b981;
  animation: pulseGreenAnim 1.6s infinite ease-in-out;
}

.nav-hud-title {
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 0.5rpx;
  color: #f8fafc;
}

.nav-hud-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.nav-hud-amap-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(37, 99, 235, 0.25);
  border: 1px solid rgba(96, 165, 250, 0.5);
  color: #93c5fd;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-hud-amap-btn:active {
  background: rgba(37, 99, 235, 0.45);
  transform: scale(0.95);
}

.hud-amap-svg {
  width: 20rpx;
  height: 20rpx;
  fill: #93c5fd;
}

.nav-hud-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-hud-stop-btn:active {
  background: rgba(239, 68, 68, 0.4);
  transform: scale(0.95);
}

.hud-stop-svg {
  width: 22rpx;
  height: 22rpx;
  fill: #fca5a5;
}

.inline-map-wrapper {
  position: relative;
  width: 100%;
  height: 440rpx;
  background: #f1f5f9;
}

.inline-map-canvas {
  width: 100%;
  height: 100%;
}

:deep(.amap-marker-label) {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
}

/* 地图浮动工具按键 */
.map-floating-controls {
  position: absolute;
  right: 16rpx;
  bottom: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  z-index: 10;
}

.map-float-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.map-float-btn:active {
  transform: scale(0.92);
  background: #f1f5f9;
}

.float-btn-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #1e293b;
}

/* 导航引导卡片 */
.nav-guidance-card {
  padding: 20rpx 24rpx;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.nav-guide-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.nav-guide-target {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #0f172a;
  max-width: 60%;
  min-width: 0;
}
/* 省略号三件套必须落在文本子元素上，flex 容器自身不生效 */
.guide-target-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.guide-target-icon {
  font-size: 26rpx;
}

.nav-guide-stats {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 700;
}

.guide-stat-mode {
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 700;
}

.guide-stat-dot {
  color: #94a3b8;
}

.guide-stat-dist {
  font-size: 24rpx;
  color: #1e40af;
  font-weight: 700;
}

/* 导航路线就绪状态栏 */
.nav-route-status-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12rpx;
  padding: 14rpx 18rpx;
}

.route-ready-svg {
  width: 28rpx;
  height: 28rpx;
  fill: #16a34a;
  flex-shrink: 0;
}

.route-ready-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #15803d;
  line-height: 1.4;
}
</style>
