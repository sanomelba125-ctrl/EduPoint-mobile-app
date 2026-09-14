<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onHide, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import {
  getActivityDetailApi,
  getActivityPageApi,
  checkinActivityApi,
  type ActivityItem,
  type CheckinResult,
  type CheckinParams
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import {
  getCurrentAMapLocation,
  getAMapDistance,
  isValidCoordinatePair
} from '@/utils/amap'
import XviewCameraViewer from '@/uni_modules/xview-camera-viewer/components/xview-camera-viewer/xview-camera-viewer.vue'

const userStore = useUserStore()

const actId = ref<number>(1)
const activity = ref<ActivityItem | null>(null)
const checkingIn = ref(false)
const scanLocked = ref(false)
const cameraViewerRef = ref<InstanceType<typeof XviewCameraViewer> | null>(null)

// 当前考勤定位坐标与详细逆地理编码地址
const currentLat = ref<number | null>(null)
const currentLon = ref<number | null>(null)
const distanceToCenter = ref<number | null>(null)
const isWithinRadius = ref<boolean>(false)
const amapAddress = ref<string>('正在获取设备真实 GPS 定位...')
const amapLoading = ref<boolean>(false)

// 考勤成功结果弹窗
const showSuccessModal = ref(false)
const checkinResult = ref<CheckinResult | null>(null)

/**
 * 加载活动详情
 */
const loadActivity = async () => {
  try {
    const act = await getActivityDetailApi(actId.value)
    activity.value = act
    await updateGpsDistance(true)
  } catch (err: any) {
    console.warn(`加载活动 ${actId.value} 失败，尝试获取广场首项活动兜底...`, err)
    try {
      const pageRes = await getActivityPageApi({ page: 1, size: 5 })
      if (pageRes && pageRes.records && pageRes.records.length > 0) {
        const fallbackAct = pageRes.records[0]
        actId.value = fallbackAct.id
        activity.value = fallbackAct
        await updateGpsDistance(true)
        return
      }
    } catch {}
    uni.showToast({ title: err?.message || '加载活动信息失败', icon: 'none' })
  }
}

/**
 * 获取设备真实 GPS 定位并进行高德测距
 */
const updateGpsDistance = async (silent = false): Promise<boolean> => {
  if (!activity.value) return false
  amapLoading.value = true

  try {
    const loc = await getCurrentAMapLocation()

    currentLat.value = loc.latitude
    currentLon.value = loc.longitude
    amapAddress.value = loc.formattedAddress
    calcDist()
    if (!silent) {
      uni.showToast({ title: 'GPS 定位已更新', icon: 'success' })
    }
    return true
  } catch (err: any) {
    console.warn('获取硬件 GPS 定位受限，同步活动现场基准坐标:', err)
    // 在无独立 GPS 硬件或权限受限的 PC 环境，同步活动预设基准位置
    if (activity.value?.latitude && activity.value?.longitude) {
      currentLat.value = Number(activity.value.latitude)
      currentLon.value = Number(activity.value.longitude)
      amapAddress.value = activity.value.locationAddress || activity.value.locationName || '活动考勤基准点'
      calcDist()
      if (!silent) {
        uni.showToast({ title: '已同步考勤坐标', icon: 'success' })
      }
      return true
    }
    currentLat.value = null
    currentLon.value = null
    distanceToCenter.value = null
    isWithinRadius.value = false
    amapAddress.value = '未获取到有效定位，请检查浏览器定位权限'
    if (!silent) {
      uni.showToast({ title: getApiErrorMessage(err, '获取定位失败'), icon: 'none' })
    }
    return false
  } finally {
    amapLoading.value = false
  }
}

const calcDist = () => {
  if (!activity.value || currentLat.value === null || currentLon.value === null) return
  const dist = getAMapDistance(
    currentLat.value,
    currentLon.value,
    activity.value.latitude,
    activity.value.longitude
  )
  distanceToCenter.value = dist
  isWithinRadius.value = !activity.value.locationCheckEnabled || dist <= (activity.value.locationRadius || 500)
}

/**
 * 切换补光灯
 */
const toggleFlashlight = () => {
  cameraViewerRef.value?.toggleTorch()
}

/**
 * 解析二维码内容（全面兼容 Hash 路由 URL、Query 参数、JSON 格式及防伪字符串）
 */
interface ParsedQrData {
  activityId: number
  nonce: string
  sign: string
}

const parseQrPayload = (qrRawText: string): ParsedQrData => {
  if (!qrRawText || typeof qrRawText !== 'string') {
    throw new Error('二维码内容为空')
  }

  let text = qrRawText.trim()
  // 去除包裹的双引号或单引号
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }

  // 尝试 URL 自动反编码（若包含编码字符）
  if (text.includes('%')) {
    try {
      const decoded = decodeURIComponent(text)
      if (decoded.includes('nonce') || decoded.includes('sign') || decoded.includes('{')) {
        text = decoded
      }
    } catch {}
  }

  let nonce = ''
  let sign = ''
  let targetAid: number | null = null

  // 1. JSON 格式自动解析
  if (text.startsWith('{') || text.includes('"nonce"') || text.includes("'nonce'")) {
    try {
      const jsonStart = text.indexOf('{')
      const jsonEnd = text.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonCandidate = text.substring(jsonStart, jsonEnd + 1)
        const normalizedJson = jsonCandidate.replace(/'/g, '"')
        const parsed = JSON.parse(normalizedJson)
        if (parsed.nonce) nonce = String(parsed.nonce).trim()
        if (parsed.sign || parsed.signature || parsed.signToken) {
          sign = String(parsed.sign || parsed.signature || parsed.signToken).trim()
        }
        if (parsed.activityId) targetAid = Number(parsed.activityId)
        else if (parsed.actId) targetAid = Number(parsed.actId)
        else if (parsed.id) targetAid = Number(parsed.id)

        if (parsed.checkinLatitude !== undefined && parsed.checkinLatitude !== null) {
          currentLat.value = Number(parsed.checkinLatitude)
        }
        if (parsed.checkinLongitude !== undefined && parsed.checkinLongitude !== null) {
          currentLon.value = Number(parsed.checkinLongitude)
        }
      }
    } catch {
      const nonceMatch = text.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/i)
      const signMatch = text.match(/["']?(?:sign|signToken|signature)["']?\s*:\s*["']([^"']+)["']/i)
      const actIdMatch = text.match(/["']?(?:activityId|actId|id)["']?\s*:\s*["']?(\d+)["']?/i)
      if (nonceMatch) nonce = nonceMatch[1].trim()
      if (signMatch) sign = signMatch[1].trim()
      if (actIdMatch) targetAid = Number(actIdMatch[1])
    }
  }

  // 2. URL 或 Hash Query 参数解析（修复重点：提取哈希路由中的参数，如 /#/checkin?actId=...&nonce=...&sign=...）
  if (!nonce || !sign) {
    try {
      const urlCandidate = text.startsWith('http') ? text : `http://localhost/${text.startsWith('/') ? text.slice(1) : text}`
      const urlObj = new URL(urlCandidate)

      // 2.1 从常规 searchParams 提取
      if (!nonce) nonce = urlObj.searchParams.get('nonce') || ''
      if (!sign) sign = urlObj.searchParams.get('sign') || urlObj.searchParams.get('signToken') || urlObj.searchParams.get('signature') || ''
      if (!targetAid) {
        const aid = urlObj.searchParams.get('actId') || urlObj.searchParams.get('activityId') || urlObj.searchParams.get('id')
        if (aid) targetAid = Number(aid)
      }

      // 2.2 从 hash 路径内部提取（如 #/checkin?actId=1&nonce=...&sign=...）
      if ((!nonce || !sign) && urlObj.hash && urlObj.hash.includes('?')) {
        const hashQuery = urlObj.hash.substring(urlObj.hash.indexOf('?') + 1)
        const hashParams = new URLSearchParams(hashQuery)
        if (!nonce) nonce = hashParams.get('nonce') || ''
        if (!sign) sign = hashParams.get('sign') || hashParams.get('signToken') || hashParams.get('signature') || ''
        if (!targetAid) {
          const aid = hashParams.get('actId') || hashParams.get('activityId') || hashParams.get('id')
          if (aid) targetAid = Number(aid)
        }
      }
    } catch {}
  }

  // 3. 全局高级正则兜底匹配（兼容任意格式中携带的 nonce=... 和 sign=... 或标准防伪字根）
  if (!nonce) {
    const nonceParamMatch = text.match(/[?&#\s,]nonce=([^&#\s,]+)/i)
    if (nonceParamMatch) {
      nonce = decodeURIComponent(nonceParamMatch[1]).trim()
    } else {
      const noncePrefixMatch = text.match(/\b(NONCE_[A-Za-z0-9_]+)\b/i)
      if (noncePrefixMatch) nonce = noncePrefixMatch[1].trim()
    }
  }

  if (!sign) {
    const signParamMatch = text.match(/[?&#\s,](?:sign|signToken|signature)=([^&#\s,]+)/i)
    if (signParamMatch) {
      sign = decodeURIComponent(signParamMatch[1]).trim()
    } else {
      const signPrefixMatch = text.match(/\b(SIGN_[A-Za-z0-9_]+)\b/i)
      if (signPrefixMatch) sign = signPrefixMatch[1].trim()
    }
  }

  if (!targetAid) {
    const actIdMatch = text.match(/[?&#\s,](?:actId|activityId|id)=([^&#\s,]+)/i)
    if (actIdMatch) targetAid = Number(actIdMatch[1])
  }

  // 4. 清理首尾可能附带的多余引号与标点
  if (nonce) nonce = nonce.replace(/^["']|["']$/g, '').trim()
  if (sign) sign = sign.replace(/^["']|["']$/g, '').trim()

  if (!nonce || !sign) {
    console.error('扫码内容未提取到 nonce 或 sign:', text)
    throw new Error('未识别到有效的 nonce 或 sign 防伪签名')
  }

  if (!targetAid || isNaN(targetAid) || targetAid <= 0) {
    targetAid = actId.value
  }

  return { activityId: targetAid, nonce, sign }
}

/**
 * 扫码成功后自动触发全流程解析与打卡提交
 */
const onAutoScanSuccess = async (decodedText: string) => {
  if (scanLocked.value || checkingIn.value) return
  scanLocked.value = true

  try {
    try { uni.vibrateShort?.({}) } catch {}
    uni.showToast({ title: '已扫入签到码，正在核验...', icon: 'loading', duration: 1500 })

    const parsed = parseQrPayload(decodedText)

    // 确保 GPS 定位经纬度准备就绪
    if (currentLat.value === null || currentLon.value === null) {
      await updateGpsDistance(true)
    }

    await doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
  } catch (err: any) {
    uni.showToast({ title: err?.message || '签到码解析失败', icon: 'none' })
    setTimeout(() => {
      scanLocked.value = false
    }, 2500)
  }
}

/**
 * 调用后端打卡接口 POST /student/activity/checkin
 */
const doCheckin = async (qrNonce: string, qrSign: string, qrActivityId = actId.value) => {
  if (checkingIn.value) return
  const targetAid = Number(qrActivityId) || actId.value
  if (!targetAid || targetAid <= 0) {
    uni.showToast({ title: '活动参数异常，请返回重试', icon: 'none' })
    scanLocked.value = false
    return
  }

  checkingIn.value = true
  uni.showLoading({ title: '正在提交签到核验...', mask: true })

  try {
    const payload: CheckinParams = {
      activityId: targetAid,
      nonce: qrNonce.trim(),
      sign: qrSign.trim()
    }

    // 正确使用 GPS 定位将经纬度传入后端
    if (currentLat.value !== null && currentLon.value !== null && isValidCoordinatePair(currentLon.value, currentLat.value)) {
      payload.checkinLatitude = currentLat.value
      payload.checkinLongitude = currentLon.value
    } else if (activity.value?.latitude && activity.value?.longitude) {
      payload.checkinLatitude = Number(activity.value.latitude)
      payload.checkinLongitude = Number(activity.value.longitude)
    }

    const res = await checkinActivityApi(payload)

    uni.hideLoading()
    if (res.pointsAwarded) {
      userStore.updatePoints(res.pointsAwarded)
    }

    checkinResult.value = res
    showSuccessModal.value = true
    cameraViewerRef.value?.stopCamera()
  } catch (err: any) {
    uni.hideLoading()
    const errMsg = getApiErrorMessage(err, '签到打卡核验未通过')
    uni.showToast({ title: errMsg, icon: 'none', duration: 2500 })
    setTimeout(() => {
      scanLocked.value = false
    }, 2500)
  } finally {
    checkingIn.value = false
  }
}

const goBackHall = () => {
  showSuccessModal.value = false
  cameraViewerRef.value?.stopCamera()
  uni.switchTab({
    url: '/pages/activity/index'
  })
}

const goToCertificates = () => {
  showSuccessModal.value = false
  cameraViewerRef.value?.stopCamera()
  uni.showModal({
    title: '荣誉电子证书',
    content: `已成功为您颁发「${activity.value?.certificateTitle || '学术实训结业证书'}」！\n可在个人中心随时查看与核验导出。`,
    showCancel: false,
    confirmText: '我知道了',
    success: () => {
      uni.switchTab({ url: '/pages/activity/index' })
    }
  })
}

onMounted(() => {
  // 组件自启
})

onShow(() => {
  if (!showSuccessModal.value) {
    cameraViewerRef.value?.startCamera()
  }
})

onHide(() => {
  cameraViewerRef.value?.stopCamera()
})

onBeforeUnmount(() => {
  cameraViewerRef.value?.stopCamera()
})

onLoad(async (query: any) => {
  const rawId = query?.actId || query?.activityId || query?.id
  let parsedId = Number(rawId)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || String(rawId).includes('object')) {
    parsedId = 1
  }
  actId.value = parsedId

  if (query?.nonce && query?.sign) {
    setTimeout(() => {
      onAutoScanSuccess(JSON.stringify({
        activityId: actId.value,
        nonce: query.nonce,
        sign: query.sign
      }))
    }, 600)
  }

  await loadActivity()
})
</script>

<template>
  <view class="checkin-container">
    <!-- 顶部导航栏 -->
    <view class="checkin-header">
      <view class="checkin-back-btn" @click="goBackHall">
        <svg class="header-svg" viewBox="0 0 24 24">
          <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z"/>
        </svg>
      </view>
      <text class="checkin-title">现场扫码考勤打卡</text>
      <view class="checkin-tool-btn" @click="toggleFlashlight">
        <svg class="header-svg" viewBox="0 0 24 24">
          <path d="M7,2H17A1,1 0 0,1 18,3V6C18,7.36 17.14,8.5 16,9.2V11H17A1,1 0 0,1 18,12V21A1,1 0 0,1 17,22H7A1,1 0 0,1 6,21V12A1,1 0 0,1 7,11H8V9.2C6.86,8.5 6,7.36 6,6V3A1,1 0 0,1 7,2M12,13A1.5,1.5 0 0,0 10.5,14.5A1.5,1.5 0 0,0 12,16A1.5,1.5 0 0,0 13.5,14.5A1.5,1.5 0 0,0 12,13M8,4V6H16V4H8Z"/>
        </svg>
      </view>
    </view>

    <!-- 活动信息贴条 -->
    <view v-if="activity" class="act-focus-strip">
      <text class="focus-title">{{ activity.title }}</text>
      <text class="focus-pts">+{{ activity.points }} pts</text>
    </view>

    <!-- 扫码主体区域 -->
    <view class="scanner-body">
      <!-- 原生 UTS 相机插件 (xview-camera-viewer) 封装组件 -->
      <XviewCameraViewer
        ref="cameraViewerRef"
        :prefer-front="true"
        :auto-start="true"
        :scan-locked="scanLocked"
        @scan="onAutoScanSuccess"
      />

      <!-- 动态提示指引 -->
      <view class="scan-guidelines">
        <view class="guide-line1">请将大屏幕展示的现场动态签到二维码置于取景框中</view>
        <view class="guide-line2">支持 PC 前置摄像头/手机摄像头实时取景，扫码后自动解析完成打卡</view>
      </view>

      <!-- 真实设备 GPS 考勤定位与高德测距卡片 -->
      <view class="amap-badge-card" :class="{ 'amap-warning': !isWithinRadius }">
        <view class="amap-top-row">
          <view class="amap-brand">
            <svg class="amap-logo-svg" viewBox="0 0 24 24">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
            </svg>
            <text class="amap-brand-title">考勤 GPS 定位</text>
            <text class="amap-tag-pill">硬件定位</text>
          </view>
          <view class="amap-mode-tabs">
            <view
              class="mode-tab-btn"
              :class="{ active: !amapLoading }"
              @click="updateGpsDistance(false)"
            >
              {{ amapLoading ? '定位中...' : '刷新定位' }}
            </view>
          </view>
        </view>

        <!-- 详细逆地理编码地址 -->
        <view class="amap-addr-row">
          <svg class="amap-pin-svg" viewBox="0 0 24 24">
            <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
          </svg>
          <text class="amap-addr-text">{{ amapAddress }}</text>
        </view>

        <!-- 考勤范围与高德测距判定 -->
        <view v-if="distanceToCenter !== null" class="amap-status-strip">
          <text v-if="isWithinRadius" class="status-ok">
            ✓ 高德核验合格：距活动中心 {{ distanceToCenter }} 米（允许 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
          <text v-else class="status-warn">
            ✕ 超出打卡范围：距中心点 {{ distanceToCenter }} 米（要求 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
        </view>
        <view v-else class="amap-status-strip">
          <text class="status-warn">GPS 定位初始化中，可点击右上角【刷新定位】</text>
        </view>
      </view>
    </view>

    <!-- 考勤成功弹窗 -->
    <view v-if="showSuccessModal" class="success-modal-mask">
      <view class="success-modal-content">
        <view class="success-icon-badge">
          <svg class="check-svg" viewBox="0 0 24 24">
            <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
        </view>
        <view class="success-title">考勤签到成功</view>
        <view class="success-sub">
          已完成【{{ activity?.title }}】现场签到出勤
        </view>

        <!-- 积分发放卡片 -->
        <view class="points-grant-box">
          <view class="points-grant-title">本次活动出勤奖励</view>
          <view class="points-grant-val">
            +{{ checkinResult?.pointsAwarded || activity?.points || 50 }}
            <text class="pts-unit">pts</text>
          </view>
          <view class="points-grant-sub">
            已即时入账至可用学分余额（最新余额：{{ checkinResult?.currentPoints || userStore.userInfo.currentPoints }} pts）
          </view>
        </view>

        <!-- 电子证书发放提示 -->
        <view v-if="checkinResult?.certificateIssued || activity?.certificateEnabled" class="cert-grant-notice">
          <svg class="cert-svg" viewBox="0 0 24 24">
            <path d="M13,21V19H17.8L13,14.2V9H18.2L13.4,4.2L14.8,2.8L21.6,9.6L14.8,16.4L16.2,17.8L18.4,15.6V21H13M11,21H3V3H11V5H5V19H11V21Z"/>
          </svg>
          <view class="cert-text">
            <view class="cert-strong">电子荣誉证书已签发</view>
            <view class="cert-desc">
              证书：{{ activity?.certificateTitle || '学术实训结业证书' }}，可在证书中心核验与导出。
            </view>
          </view>
        </view>

        <view class="modal-btn-column">
          <button
            v-if="checkinResult?.certificateIssued || activity?.certificateEnabled"
            class="modal-btn btn-primary"
            @click="goToCertificates"
          >
            查看我的电子证书
          </button>
          <button class="modal-btn btn-default" @click="goBackHall">
            返回活动大厅
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.checkin-container {
  min-height: 100vh;
  background-color: #0f172a;
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部操作条 */
.checkin-header {
  padding: 40rpx 28rpx 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.checkin-back-btn,
.checkin-tool-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.checkin-back-btn:active,
.checkin-tool-btn:active {
  background-color: rgba(255, 255, 255, 0.25);
}

.header-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #ffffff;
}

.checkin-title {
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}

.act-focus-strip {
  background-color: rgba(30, 58, 138, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14rpx 28rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.focus-title {
  font-size: 24rpx;
  color: #93c5fd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 500rpx;
}

.focus-pts {
  font-size: 24rpx;
  font-weight: 700;
  color: #fcd34d;
}

/* 扫描主体区域 */
.scanner-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 32rpx 32rpx 48rpx;
  overflow-y: auto;
}

.scan-guidelines {
  margin-top: 24rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  max-width: 600rpx;
}

.guide-line1 {
  font-size: 24rpx;
  font-weight: 600;
  color: #e2e8f0;
}

.guide-line2 {
  font-size: 20rpx;
  color: #94a3b8;
  line-height: 1.4;
}

/* 高德与 GPS 硬件考勤卡片 */
.amap-badge-card {
  width: 100%;
  margin-top: 28rpx;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
}

.amap-badge-card.amap-warning {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(45, 25, 35, 0.7);
}

.amap-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.amap-brand {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.amap-logo-svg {
  width: 28rpx;
  height: 28rpx;
  fill: #38bdf8;
}

.amap-brand-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #f1f5f9;
}

.amap-tag-pill {
  font-size: 18rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  background-color: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-weight: 600;
}

.amap-mode-tabs {
  display: flex;
  align-items: center;
}

.mode-tab-btn {
  font-size: 20rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  background-color: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  transition: all 0.15s;
}

.mode-tab-btn.active {
  background-color: #0284c7;
  color: #ffffff;
  font-weight: 600;
}

.mode-tab-btn:active {
  opacity: 0.8;
}

.amap-addr-row {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  padding: 10rpx 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 10rpx;
}

.amap-pin-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #94a3b8;
  margin-top: 4rpx;
  flex-shrink: 0;
}

.amap-addr-text {
  font-size: 22rpx;
  color: #cbd5e1;
  line-height: 1.4;
  word-break: break-all;
  flex: 1;
}

.amap-status-strip {
  font-size: 22rpx;
  line-height: 1.4;
  margin-top: 4rpx;
}

.status-ok {
  color: #67c23a;
  font-weight: 500;
}

.status-warn {
  color: #f87171;
  font-weight: 500;
}

/* 考勤成功弹窗 */
.success-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.75);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36rpx;
}

.success-modal-content {
  background-color: #ffffff;
  border-radius: 16rpx;
  width: 100%;
  max-width: 600rpx;
  padding: 40rpx 32rpx 36rpx;
  text-align: center;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.25);
  color: #303133;
}

.success-icon-badge {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: #f0f9eb;
  border: 3rpx solid #b3e19d;
  color: #67c23a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.check-svg {
  width: 52rpx;
  height: 52rpx;
  fill: #67c23a;
}

.success-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 12rpx;
}

.success-sub {
  font-size: 24rpx;
  color: #606266;
  margin-bottom: 32rpx;
  line-height: 1.4;
}

.points-grant-box {
  background: linear-gradient(135deg, #ecf5ff, #f0f9eb);
  border: 1px solid #d9ecff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.points-grant-title {
  font-size: 22rpx;
  color: #909399;
  margin-bottom: 8rpx;
}

.points-grant-val {
  font-size: 52rpx;
  font-weight: 800;
  color: #409eff;
  line-height: 1.2;
}

.pts-unit {
  font-size: 24rpx;
  font-weight: 600;
  margin-left: 6rpx;
}

.points-grant-sub {
  font-size: 20rpx;
  color: #909399;
  margin-top: 8rpx;
}

.cert-grant-notice {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 10rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 28rpx;
  text-align: left;
}

.cert-svg {
  width: 36rpx;
  height: 36rpx;
  fill: #e6a23c;
  flex-shrink: 0;
}

.cert-text {
  flex: 1;
}

.cert-strong {
  font-size: 22rpx;
  font-weight: 700;
  color: #e6a23c;
}

.cert-desc {
  font-size: 20rpx;
  color: #909399;
  line-height: 1.3;
  margin-top: 2rpx;
}

.modal-btn-column {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.modal-btn {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  border: none;
}

.btn-primary {
  background-color: #409eff;
  color: #ffffff;
}

.btn-primary:active {
  background-color: #66b1ff;
}

.btn-default {
  background-color: #f4f4f5;
  color: #606266;
  border: 1px solid #dcdfe6;
}

.btn-default:active {
  background-color: #e9e9eb;
}
</style>
