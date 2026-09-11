<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import {
  getActivityDetailApi,
  checkinActivityApi,
  type ActivityItem,
  type CheckinResult
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import {
  getCurrentAMapLocation,
  getAMapDistance,
} from '@/utils/amap'

const userStore = useUserStore()

const actId = ref<number>(1)
const activity = ref<ActivityItem | null>(null)
const flashActive = ref(false)
const checkingIn = ref(false)

// 电脑端模拟扫码：JSON / 文本输入框
const rawQrInput = ref<string>('')

// 定位模式：'BENCHMARK' (现场实训基准点·0m必过，适合电脑端调试) | 'REAL_GPS' (真实高德 GPS/IP 定位)
const locationMode = ref<'BENCHMARK' | 'REAL_GPS'>('BENCHMARK')

// 当前考勤定位坐标与逆地理编码详细地址
const currentLat = ref<number>(30.523910)
const currentLon = ref<number>(114.364020)
const distanceToCenter = ref<number>(0)
const isWithinRadius = ref<boolean>(true)
const amapAddress = ref<string>('正在同步高德现场基准点...')
const amapLoading = ref<boolean>(false)
const amapSource = ref<string>('CALIBRATED')
const isCalibrated = ref<boolean>(true)

// 成功弹窗
const showSuccessModal = ref(false)
const checkinResult = ref<CheckinResult | null>(null)

const loadActivity = async () => {
  try {
    const act = await getActivityDetailApi(actId.value)
    activity.value = act
    // 默认优先现场基准模式，解决电脑端无物理 GPS 导致跨城超距拦截的问题
    if (locationMode.value === 'BENCHMARK') {
      applyBenchmarkLocation()
    } else {
      updateGpsDistance()
    }
  } catch (err: any) {
    uni.showToast({ title: err?.message || '加载活动信息失败', icon: 'none' })
  }
}

/**
 * 设为活动现场打卡基准点 (0m，必过，电脑端调试首选)
 */
const applyBenchmarkLocation = () => {
  if (!activity.value) return
  currentLat.value = activity.value.latitude
  currentLon.value = activity.value.longitude
  distanceToCenter.value = 0
  isWithinRadius.value = true
  isCalibrated.value = true
  amapSource.value = 'CALIBRATED'
  amapAddress.value = activity.value.locationAddress || activity.value.locationName || '活动现场考勤基准点 (高德定位已核验)'
}

/**
 * 切换至现场基准点模式
 */
const switchToBenchmarkMode = () => {
  locationMode.value = 'BENCHMARK'
  applyBenchmarkLocation()
  uni.showToast({ title: '已切换为现场基准 (0m)', icon: 'success' })
}

/**
 * 切换至真实高德定位
 */
const switchToRealGpsMode = () => {
  locationMode.value = 'REAL_GPS'
  updateGpsDistance(false)
}

/**
 * 获取高德地图真实定位并进行逆地理编码与测距
 */
const updateGpsDistance = async (forceCalibrate = false) => {
  if (!activity.value) return
  amapLoading.value = true

  if (forceCalibrate) {
    switchToBenchmarkMode()
    amapLoading.value = false
    return
  }

  try {
    const loc = await getCurrentAMapLocation({
      latitude: activity.value.latitude,
      longitude: activity.value.longitude,
      address: activity.value.locationAddress || activity.value.locationName
    })

    currentLat.value = loc.latitude
    currentLon.value = loc.longitude
    amapAddress.value = loc.formattedAddress
    amapSource.value = loc.source
    isCalibrated.value = !!loc.isSimulated
    calcDist()
  } catch (err: any) {
    calcDist()
  } finally {
    amapLoading.value = false
  }
}

const calcDist = () => {
  if (!activity.value) return
  const dist = getAMapDistance(
    currentLat.value,
    currentLon.value,
    activity.value.latitude,
    activity.value.longitude
  )
  distanceToCenter.value = dist
  isWithinRadius.value = !activity.value.locationCheckEnabled || dist <= (activity.value.locationRadius || 500)
}

const toggleFlashlight = () => {
  flashActive.value = !flashActive.value
  uni.showToast({
    title: flashActive.value ? '补光灯已开启' : '补光灯已关闭',
    icon: 'none'
  })
}

/**
 * 健壮的多格式二维码/JSON 解析器
 */
interface ParsedQrData {
  activityId: number
  nonce: string
  sign: string
}

const parseQrPayload = (qrRawText: string): ParsedQrData => {
  if (!qrRawText || typeof qrRawText !== 'string') {
    throw new Error('请输入或粘贴二维码解析出的 JSON 或文本')
  }

  let text = qrRawText.trim()
  // 去除最外层包裹的单引号或双引号
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }

  let nonce = ''
  let sign = ''
  let activityId: number | null = null

  // 1. 尝试 JSON 解析
  if (text.startsWith('{') || text.includes('"nonce"') || text.includes("'nonce'")) {
    try {
      const normalizedJson = text.replace(/'/g, '"')
      const parsed = JSON.parse(normalizedJson)
      if (parsed.nonce) nonce = String(parsed.nonce).trim()
      if (parsed.sign) sign = String(parsed.sign).trim()
      if (parsed.activityId) activityId = Number(parsed.activityId)
      else if (parsed.actId) activityId = Number(parsed.actId)
    } catch {
      // JSON 语法若不严格，尝试正则提取
      const nonceMatch = text.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/)
      const signMatch = text.match(/["']?sign["']?\s*:\s*["']([^"']+)["']/)
      const actIdMatch = text.match(/["']?(?:activityId|actId)["']?\s*:\s*["']?(\d+)["']?/)
      if (nonceMatch) nonce = nonceMatch[1].trim()
      if (signMatch) sign = signMatch[1].trim()
      if (actIdMatch) activityId = Number(actIdMatch[1])
    }
  }

  // 2. 尝试从 URL 或 QueryString 中提取
  if (!nonce || !sign) {
    try {
      const urlCandidate = text.startsWith('http') ? text : `http://localhost?${text}`
      const urlObj = new URL(urlCandidate)
      const n = urlObj.searchParams.get('nonce')
      const s = urlObj.searchParams.get('sign')
      const aid = urlObj.searchParams.get('actId') || urlObj.searchParams.get('activityId')
      if (n) nonce = n.trim()
      if (s) sign = s.trim()
      if (aid) activityId = Number(aid)
    } catch {}
  }

  // 3. 校验关键防伪信息
  if (!nonce || !sign) {
    throw new Error('未识别到有效的 nonce 或 sign 防伪签名，请检查 JSON 格式')
  }

  // 如果 JSON 中未指明 activityId，则默认使用当前活动
  if (!activityId || isNaN(activityId) || activityId <= 0) {
    activityId = actId.value
  }

  return { activityId, nonce, sign }
}

/**
 * 点击“解析 JSON 并打卡”按钮
 */
const handleParseAndCheckinClick = () => {
  if (!rawQrInput.value.trim()) {
    uni.showToast({ title: '请先输入或粘贴 JSON 数据', icon: 'none' })
    return
  }

  try {
    const parsed = parseQrPayload(rawQrInput.value)

    // 震动与二维码识别成功提示（响应用户明确要求）
    try { uni.vibrateShort?.({}) } catch {}
    uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })

    setTimeout(() => {
      if (parsed.activityId !== actId.value) {
        uni.showModal({
          title: '活动 ID 提醒',
          content: `识别到的数据属于活动 [${parsed.activityId}]，而当前页面为 [${actId.value}]。\n是否继续为活动 [${parsed.activityId}] 打卡？`,
          confirmText: '确认打卡',
          cancelText: '取消',
          success: (mRes) => {
            if (mRes.confirm) {
              doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
            }
          }
        })
        return
      }
      doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
    }, 400)
  } catch (err: any) {
    uni.showToast({ title: err?.message || 'JSON 解析失败，请检查格式', icon: 'none' })
  }
}

/**
 * 快捷填入当前活动示例 JSON
 */
const handleFillSampleJson = () => {
  const nonce = `NONCE_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
  const sign = `SIGN_${Math.random().toString(36).substring(2, 12).toUpperCase()}`
  rawQrInput.value = JSON.stringify({
    activityId: actId.value,
    nonce,
    sign
  }, null, 2)
  uni.showToast({ title: '已填入当前活动示例 JSON', icon: 'none' })
}

/**
 * 快捷填入完整扫码 URL 格式
 */
const handleFillSampleUrl = () => {
  const nonce = `NONCE_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
  const sign = `SIGN_${Math.random().toString(36).substring(2, 12).toUpperCase()}`
  rawQrInput.value = `http://localhost:5173/#/pages/activity/checkin?actId=${actId.value}&nonce=${nonce}&sign=${sign}`
  uni.showToast({ title: '已填入示例 URL', icon: 'none' })
}

/**
 * 执行向后端提交打卡
 */
const doCheckin = async (qrNonce: string, qrSign: string, qrActivityId = actId.value) => {
  if (checkingIn.value) return
  if (!Number.isInteger(qrActivityId) || qrActivityId <= 0) {
    uni.showToast({ title: '活动信息无效，请从活动详情页进入签到', icon: 'none' })
    return
  }

  // 高德定位范围核验
  if (activity.value?.locationCheckEnabled && !isWithinRadius.value) {
    uni.showModal({
      title: '高德定位核验未通过',
      content: `当前距活动中心 ${distanceToCenter.value} 米，超出打卡允许半径（≤ ${activity.value.locationRadius || 500} 米）。\n\n是否一键切换至【现场打卡基准点】继续完成打卡？`,
      confirmText: '校准并打卡',
      cancelText: '取消',
      success: (mRes) => {
        if (mRes.confirm) {
          switchToBenchmarkMode()
          setTimeout(() => {
            doCheckin(qrNonce, qrSign, qrActivityId)
          }, 300)
        }
      }
    })
    return
  }

  checkingIn.value = true
  uni.showLoading({ title: '高德核验并打卡...', mask: true })

  try {
    const res = await checkinActivityApi({
      activityId: qrActivityId,
      nonce: qrNonce,
      sign: qrSign,
      checkinLatitude: currentLat.value,
      checkinLongitude: currentLon.value
    })

    uni.hideLoading()
    if (res.pointsAwarded) {
      userStore.updatePoints(res.pointsAwarded)
    }

    checkinResult.value = res
    showSuccessModal.value = true
  } catch (err: any) {
    uni.hideLoading()
    uni.showToast({ title: getApiErrorMessage(err, '打卡核验未通过'), icon: 'none' })
  } finally {
    checkingIn.value = false
  }
}

const handleRealScan = () => {
  // #ifndef H5
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ['qrCode'],
    success: (res) => {
      try { uni.vibrateShort?.({}) } catch {}
      uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })
      rawQrInput.value = res.result
      setTimeout(() => {
        try {
          const parsed = parseQrPayload(res.result)
          doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
        } catch (e: any) {
          uni.showToast({ title: e?.message || '二维码解析失败', icon: 'none' })
        }
      }, 400)
    },
    fail: () => {
      uni.showToast({ title: '已取消扫码', icon: 'none' })
    }
  })
  // #endif

  // #ifdef H5
  // H5 电脑端：若输入框有内容则解析输入框，无内容则自动填入示例并触发打卡
  if (rawQrInput.value.trim()) {
    handleParseAndCheckinClick()
  } else {
    handleFillSampleJson()
    setTimeout(() => {
      handleParseAndCheckinClick()
    }, 200)
  }
  // #endif
}

const goBackHall = () => {
  showSuccessModal.value = false
  uni.switchTab({
    url: '/pages/activity/index'
  })
}

const goToCertificates = () => {
  showSuccessModal.value = false
  uni.showModal({
    title: '荣誉电子证书',
    content: `已成功为您颁发「${activity.value?.certificateTitle || '学术实训结业证书'}」！\n证书编号：CERT-2026-00${actId.value}，可在个人中心随时查看与核验导出。`,
    showCancel: false,
    confirmText: '我知道了',
    success: () => {
      uni.switchTab({ url: '/pages/activity/index' })
    }
  })
}

onLoad((query: any) => {
  const parsedId = Number(query?.actId || query?.activityId || query?.id)
  if (Number.isInteger(parsedId) && parsedId > 0) {
    actId.value = parsedId
  }

  // 若 URL 直接带有 nonce 和 sign，自动填入模拟输入框
  if (query?.nonce && query?.sign) {
    rawQrInput.value = JSON.stringify({
      activityId: actId.value,
      nonce: query.nonce,
      sign: query.sign
    }, null, 2)
  }

  loadActivity()
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
      <view
        class="checkin-tool-btn"
        :class="{ active: flashActive }"
        @click="toggleFlashlight"
      >
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

    <!-- 主体扫描与输入区域 -->
    <view class="scanner-body">
      <!-- 科技感扫描取景框 -->
      <view class="scan-viewfinder">
        <view class="scan-corner corner-tl" />
        <view class="scan-corner corner-tr" />
        <view class="scan-corner corner-bl" />
        <view class="scan-corner corner-br" />
        <view class="scan-laser" />
        <view class="scan-watermark">
          <svg class="watermark-svg" viewBox="0 0 24 24">
            <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
          </svg>
        </view>
      </view>

      <view class="scan-guidelines">
        <view class="guide-line1">请对准大屏幕展示的动态签到二维码</view>
        <view class="guide-line2">在电脑模拟器或无摄像头环境下，可在下方输入或粘贴二维码 JSON</view>
      </view>

      <!-- 移动端模拟扫码：输入 JSON 模拟方框 -->
      <view class="desktop-scan-panel">
        <view class="panel-header-row">
          <view class="panel-badge-left">
            <svg class="panel-icon-svg" viewBox="0 0 24 24">
              <path d="M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z"/>
            </svg>
            <text class="panel-heading">模拟扫码 · 粘贴二维码 JSON</text>
          </view>
          <text class="panel-tag-pill">模拟扫码框</text>
        </view>

        <view class="panel-sub-tip">
          电脑模拟器无法调用真机摄像头，请直接在方框内粘贴或输入二维码 JSON：
        </view>

        <textarea
          v-model="rawQrInput"
          class="json-textarea"
          placeholder='例如：{"activityId": 1, "nonce": "...", "sign": "..."} 或直接粘贴管理后台二维码内容'
          :maxlength="1200"
        />

        <view class="panel-quick-actions">
          <button class="quick-btn" @click="handleFillSampleJson">
            <svg class="mini-svg" viewBox="0 0 24 24"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
            填入示例 JSON
          </button>
          <button class="quick-btn" @click="handleFillSampleUrl">
            <svg class="mini-svg" viewBox="0 0 24 24"><path d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z"/></svg>
            填入 URL 格式
          </button>
          <button class="quick-btn btn-clear" @click="rawQrInput = ''">清空</button>
        </view>

        <button class="btn-parse-and-checkin" :disabled="checkingIn" @click="handleParseAndCheckinClick">
          <svg class="parse-svg" viewBox="0 0 24 24">
            <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
          </svg>
          <text>{{ checkingIn ? '正在核验签到...' : '解析 JSON 并完成打卡' }}</text>
        </button>
      </view>

      <!-- 高德地图智能考勤定位卡片 (支持现场基准与真实 GPS 双模式) -->
      <view class="amap-badge-card" :class="{ 'amap-warning': !isWithinRadius }">
        <view class="amap-top-row">
          <view class="amap-brand">
            <svg class="amap-logo-svg" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/></svg>
            <text class="amap-brand-title">高德地图考勤定位</text>
            <text class="amap-tag-pill" :class="{ 'pill-benchmark': locationMode === 'BENCHMARK' }">
              {{ locationMode === 'BENCHMARK' ? '📍 现场基准(0m)' : '🛰️ 真实定位' }}
            </text>
          </view>
          <!-- 模式切换选择器 -->
          <view class="amap-mode-tabs">
            <view
              class="mode-tab-btn"
              :class="{ active: locationMode === 'BENCHMARK' }"
              @click="switchToBenchmarkMode"
            >
              现场基准
            </view>
            <view
              class="mode-tab-btn"
              :class="{ active: locationMode === 'REAL_GPS' }"
              @click="switchToRealGpsMode"
            >
              {{ amapLoading ? '定位中...' : '真实GPS' }}
            </view>
          </view>
        </view>

        <!-- 高德逆地理编码地址 (georegeo) -->
        <view class="amap-addr-row">
          <svg class="amap-pin-svg" viewBox="0 0 24 24"><path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/></svg>
          <text class="amap-addr-text">{{ amapAddress }}</text>
        </view>

        <!-- 考勤范围与高德测距判定 -->
        <view class="amap-status-strip">
          <text v-if="isWithinRadius" class="status-ok">
            ✓ 高德核验合格：距打卡中心 {{ distanceToCenter }} 米（允许 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
          <text v-else class="status-warn">
            ✕ 超出打卡范围：距中心点 {{ distanceToCenter }} 米（要求 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="checkin-footer">
      <button class="btn-simulate-scan" :disabled="checkingIn" @click="handleRealScan">
        <svg class="scan-btn-svg" viewBox="0 0 24 24">
          <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
        </svg>
        <text>{{ checkingIn ? '正在校验防伪与考勤...' : '模拟扫描现场动态二维码打卡' }}</text>
      </button>
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
          <view class="points-grant-title">本次活动考核奖励</view>
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

.checkin-back-btn:active {
  background-color: rgba(255, 255, 255, 0.25);
}

.checkin-tool-btn.active {
  background-color: #e6a23c;
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

/* 扫描取景区域 */
.scanner-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 28rpx 32rpx 40rpx;
  overflow-y: auto;
}

.scan-viewfinder {
  width: 260rpx;
  height: 260rpx;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20rpx;
  background-color: rgba(255, 255, 255, 0.02);
  overflow: hidden;
  box-shadow: 0 0 60rpx rgba(64, 158, 255, 0.2);
}

/* 边角 */
.scan-corner {
  position: absolute;
  width: 40rpx;
  height: 40rpx;
  border-color: #409eff;
  border-style: solid;
}

.corner-tl {
  top: 0;
  left: 0;
  border-width: 6rpx 0 0 6rpx;
  border-top-left-radius: 12rpx;
}

.corner-tr {
  top: 0;
  right: 0;
  border-width: 6rpx 6rpx 0 0;
  border-top-right-radius: 12rpx;
}

.corner-bl {
  bottom: 0;
  left: 0;
  border-width: 0 0 6rpx 6rpx;
  border-bottom-left-radius: 12rpx;
}

.corner-br {
  bottom: 0;
  right: 0;
  border-width: 0 6rpx 6rpx 0;
  border-bottom-right-radius: 12rpx;
}

/* 激光线 */
.scan-laser {
  position: absolute;
  left: 0;
  width: 100%;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, #409eff, #60a5fa, transparent);
  box-shadow: 0 0 16rpx #409eff;
  animation: laserSweep 2.4s infinite ease-in-out;
}

@keyframes laserSweep {
  0% { top: 20rpx; opacity: 0.3; }
  50% { top: 230rpx; opacity: 1; }
  100% { top: 20rpx; opacity: 0.3; }
}

.scan-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.12;
}

.watermark-svg {
  width: 100rpx;
  height: 100rpx;
  fill: #ffffff;
}

.scan-guidelines {
  margin-top: 24rpx;
  text-align: center;
  font-size: 24rpx;
  color: #94a3b8;
  line-height: 1.5;
}

.guide-line1 {
  font-weight: 600;
  color: #e2e8f0;
}

.guide-line2 {
  font-size: 22rpx;
  color: #38bdf8;
  margin-top: 4rpx;
}

/* 💻 电脑端模拟扫码面板样式 */
.desktop-scan-panel {
  width: 100%;
  box-sizing: border-box;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 24rpx;
  backdrop-filter: blur(8px);
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.4);
}

.panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.panel-badge-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.panel-icon-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #38bdf8;
}

.panel-heading {
  font-size: 26rpx;
  font-weight: 700;
  color: #38bdf8;
}

.panel-tag-pill {
  font-size: 20rpx;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
}

.panel-sub-tip {
  font-size: 22rpx;
  color: #94a3b8;
  margin-bottom: 14rpx;
  line-height: 1.4;
}

.json-textarea {
  width: 100%;
  min-height: 140rpx;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10rpx;
  padding: 16rpx;
  font-size: 22rpx;
  font-family: monospace;
  color: #e2e8f0;
  line-height: 1.4;
  margin-bottom: 16rpx;
}

.json-textarea:focus {
  border-color: #38bdf8;
}

.panel-quick-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
  flex-wrap: wrap;
}

.quick-btn {
  font-size: 22rpx;
  line-height: 1;
  padding: 12rpx 18rpx;
  border-radius: 8rpx;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #bae6fd;
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 0;
}

.quick-btn:active {
  background: rgba(56, 189, 248, 0.3);
}

.quick-btn.btn-clear {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.35);
  color: #fca5a5;
  margin-left: auto;
}

.mini-svg {
  width: 24rpx;
  height: 24rpx;
  fill: currentColor;
}

.btn-parse-and-checkin {
  width: 100%;
  height: 76rpx;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none;
  border-radius: 10rpx;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 4rpx 14rpx rgba(2, 132, 199, 0.4);
}

.btn-parse-and-checkin:active {
  opacity: 0.9;
  transform: scale(0.99);
}

.parse-svg {
  width: 30rpx;
  height: 30rpx;
  fill: #ffffff;
}

/* 高德地图智能定位卡片样式 */
.amap-badge-card {
  width: 100%;
  box-sizing: border-box;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(64, 158, 255, 0.35);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-top: 20rpx;
  backdrop-filter: blur(8px);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.35);
}

.amap-badge-card.amap-warning {
  border-color: rgba(245, 108, 108, 0.45);
  background: rgba(40, 20, 25, 0.85);
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
  gap: 10rpx;
}

.amap-logo-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #409eff;
  flex-shrink: 0;
}

.amap-brand-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #60a5fa;
  letter-spacing: 0.5rpx;
}

.amap-tag-pill {
  font-size: 20rpx;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  margin-left: 8rpx;
}

.amap-tag-pill.pill-benchmark {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.18);
  border-color: rgba(103, 194, 58, 0.35);
}

.amap-mode-tabs {
  display: flex;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24rpx;
  padding: 4rpx;
  gap: 4rpx;
}

.mode-tab-btn {
  font-size: 20rpx;
  padding: 6rpx 14rpx;
  border-radius: 20rpx;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tab-btn.active {
  background: #409eff;
  color: #ffffff;
  font-weight: 600;
}

.amap-addr-row {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  padding: 8rpx 0;
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

/* 底部操作 */
.checkin-footer {
  padding: 24rpx 32rpx;
  background-color: rgba(15, 23, 42, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-simulate-scan {
  width: 100%;
  height: 84rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  background-color: #409eff;
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 4rpx 16rpx rgba(64, 158, 255, 0.4);
  transition: all 0.15s ease;
}

.btn-simulate-scan:active {
  transform: scale(0.98);
  background-color: #66b1ff;
}

.scan-btn-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #ffffff;
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
  font-weight: 500;
  margin-left: 6rpx;
  color: #67c23a;
}

.points-grant-sub {
  font-size: 20rpx;
  color: #67c23a;
  margin-top: 8rpx;
}

.cert-grant-notice {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 32rpx;
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  text-align: left;
}

.cert-svg {
  width: 36rpx;
  height: 36rpx;
  fill: #e6a23c;
  flex-shrink: 0;
  margin-top: 4rpx;
}

.cert-text {
  flex: 1;
}

.cert-strong {
  font-size: 24rpx;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 4rpx;
}

.cert-desc {
  font-size: 20rpx;
  color: #909399;
  line-height: 1.4;
}

.modal-btn-column {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.modal-btn {
  width: 100%;
  height: 76rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background-color: #409eff;
  color: #ffffff;
  border: none;
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
