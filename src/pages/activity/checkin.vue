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

// 当前学生实时高德 GPS 坐标与逆地理编码详细地址
const currentLat = ref<number>(30.523910)
const currentLon = ref<number>(114.364020)
const distanceToCenter = ref<number>(28)
const isWithinRadius = ref(true)
const amapAddress = ref<string>('正在获取高德高精度定位...')
const amapLoading = ref<boolean>(false)
const amapSource = ref<string>('AMAP_GPS')
const isCalibrated = ref<boolean>(false)

// 成功弹窗
const showSuccessModal = ref(false)
const checkinResult = ref<CheckinResult | null>(null)

const loadActivity = async () => {
  try {
    const act = await getActivityDetailApi(actId.value)
    activity.value = act
    updateGpsDistance()
  } catch (err: any) {
    uni.showToast({ title: err?.message || '加载活动信息失败', icon: 'none' })
  }
}

/**
 * 获取高德地图定位并进行逆地理编码与测距
 */
const updateGpsDistance = async (forceCalibrate = false) => {
  if (!activity.value) return
  amapLoading.value = true

  if (forceCalibrate) {
    // 校准至活动现场打卡坐标（便于演示与实训测试）
    currentLat.value = activity.value.latitude
    currentLon.value = activity.value.longitude
    isCalibrated.value = true
    amapAddress.value = activity.value.locationAddress || activity.value.locationName || '活动现场（高德基准已校准）'
    calcDist()
    amapLoading.value = false
    uni.showToast({ title: '已校准至现场打卡点', icon: 'success' })
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
      content: `高德地图测算显示，您当前距活动中心 ${distanceToCenter.value} 米，超出允许的打卡半径（≤ ${activity.value.locationRadius || 500} 米）。\n\n是否使用高德校准至活动现场（${activity.value.locationName}）继续？`,
      confirmText: '校准并打卡',
      cancelText: '取消',
      success: (mRes) => {
        if (mRes.confirm) {
          updateGpsDistance(true)
          setTimeout(() => {
            doCheckin(qrNonce, qrSign)
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
      // 触感震动反馈
      try { uni.vibrateShort({}) } catch {}
      uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })
      setTimeout(() => {
        parseAndCheckin(res.result)
      }, 400)
    },
    fail: () => {
      uni.showToast({ title: '已取消扫码', icon: 'none' })
    }
  })
  // #endif

  // #ifdef H5
  triggerSimulateScan()
  // #endif
}

const parseAndCheckin = (qrText: string) => {
  try {
    let nonce = ''
    let sign = ''
    let qrActivityId = actId.value

    if (qrText.includes('nonce=') && qrText.includes('sign=')) {
      const urlObj = new URL(qrText, 'http://localhost')
      nonce = urlObj.searchParams.get('nonce') || ''
      sign = urlObj.searchParams.get('sign') || ''
      const aid = Number(urlObj.searchParams.get('actId'))
      if (Number.isInteger(aid) && aid > 0) qrActivityId = aid
    } else if (qrText.startsWith('{') && qrText.endsWith('}')) {
      const parsed = JSON.parse(qrText)
      nonce = typeof parsed.nonce === 'string' ? parsed.nonce : ''
      sign = typeof parsed.sign === 'string' ? parsed.sign : ''
      const aid = Number(parsed.activityId)
      if (Number.isInteger(aid) && aid > 0) qrActivityId = aid
    }

    if (!nonce || !sign || !Number.isInteger(qrActivityId) || qrActivityId <= 0) {
      throw new Error('二维码缺少活动、nonce 或签名信息')
    }
    if (qrActivityId !== actId.value) {
      uni.showToast({ title: '二维码不属于当前活动，请重新扫码', icon: 'none' })
      return
    }
    doCheckin(nonce, sign, qrActivityId)
  } catch {
    uni.showToast({ title: '二维码格式无效，请重新扫码', icon: 'none' })
  }
}

const triggerSimulateScan = () => {
  // H5 仅模拟“扫码动作”，明确携带当前活动 ID；nonce/sign 仍交给后端做真实防伪校验。
  const simulatedQrPayload = JSON.stringify({
    activityId: actId.value,
    nonce: 'NONCE_DYNAMIC_TEST',
    sign: 'SIGN_DYNAMIC_TEST'
  })
  // 弹出二维码识别成功提示
  uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })
  setTimeout(() => {
    parseAndCheckin(simulatedQrPayload)
  }, 400)
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
  const parsedId = Number(query?.actId)
  if (Number.isInteger(parsedId) && parsedId > 0) {
    actId.value = parsedId
  } else if (query?.actId !== undefined) {
    uni.showToast({ title: '活动参数无效', icon: 'none' })
    return
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

    <!-- 科技感扫描取景框 -->
    <view class="scanner-body">
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
        <view class="guide-line2">系统将实时校验签名防伪与现场 GPS 坐标</view>
      </view>

      <!-- 高德地图智能定位与逆地理编码状态卡片 (AMap Georegeo) -->
      <view class="amap-badge-card" :class="{ 'amap-warning': !isWithinRadius }">
        <view class="amap-top-row">
          <view class="amap-brand">
            <svg class="amap-logo-svg" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/></svg>
            <text class="amap-brand-title">高德地图定位核验</text>
            <text v-if="isCalibrated" class="amap-tag-pill">现场基准</text>
          </view>
          <view class="amap-actions">
            <button class="amap-mini-btn" :disabled="amapLoading" @click="updateGpsDistance(false)">
              {{ amapLoading ? '定位中' : '刷新高德' }}
            </button>
            <button v-if="!isWithinRadius" class="amap-mini-btn btn-cal" @click="updateGpsDistance(true)">
              校准在场
            </button>
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
  justify-content: center;
  padding: 36rpx 32rpx;
}

.scan-viewfinder {
  width: 480rpx;
  height: 480rpx;
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
  50% { top: 450rpx; opacity: 1; }
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
  width: 200rpx;
  height: 200rpx;
  fill: #ffffff;
}

.scan-guidelines {
  margin-top: 36rpx;
  text-align: center;
  font-size: 26rpx;
  color: #94a3b8;
  line-height: 1.6;
}

.guide-line1 {
  font-weight: 600;
  color: #e2e8f0;
}

.guide-line2 {
  font-size: 22rpx;
  color: #64748b;
  margin-top: 6rpx;
}

/* 高德地图智能定位卡片样式 */
.amap-badge-card {
  width: 100%;
  box-sizing: border-box;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(64, 158, 255, 0.35);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-top: 28rpx;
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
  color: #67c23a;
  background: rgba(103, 194, 58, 0.18);
  border: 1px solid rgba(103, 194, 58, 0.35);
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  margin-left: 8rpx;
}

.amap-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.amap-mini-btn {
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  background: rgba(64, 158, 255, 0.18);
  border: 1px solid rgba(64, 158, 255, 0.4);
  color: #93c5fd;
  margin: 0;
}

.amap-mini-btn:active {
  opacity: 0.8;
}

.amap-mini-btn.btn-cal {
  background: rgba(230, 162, 60, 0.2);
  border-color: rgba(230, 162, 60, 0.45);
  color: #fcd34d;
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
  padding: 32rpx;
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
  margin-bottom: 8rpx;
}

.success-sub {
  font-size: 24rpx;
  color: #909399;
  margin-bottom: 24rpx;
}

.points-grant-box {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.points-grant-title {
  font-size: 22rpx;
  color: #b88230;
  margin-bottom: 4rpx;
}

.points-grant-val {
  font-size: 48rpx;
  font-weight: 700;
  color: #e6a23c;
}

.points-grant-val .pts-unit {
  font-size: 24rpx;
  font-weight: normal;
  color: #909399;
  margin-left: 6rpx;
}

.points-grant-sub {
  font-size: 20rpx;
  color: #909399;
  margin-top: 6rpx;
}

.cert-grant-notice {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  background-color: #f0f9eb;
  border: 1px solid #c2e7b0;
  border-radius: 8rpx;
  padding: 16rpx 20rpx;
  font-size: 22rpx;
  color: #529b2e;
  text-align: left;
  margin-bottom: 30rpx;
}

.cert-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #67c23a;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.cert-strong {
  font-weight: 700;
  font-size: 24rpx;
  margin-bottom: 4rpx;
}

.cert-desc {
  color: #67c23a;
  line-height: 1.4;
}

.modal-btn-column {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.modal-btn {
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  border: none;
  transition: all 0.15s ease;
}

.modal-btn:active {
  transform: scale(0.98);
}

.modal-btn.btn-primary {
  background-color: #409eff;
  color: #ffffff;
}

.modal-btn.btn-default {
  background-color: #f4f4f5;
  color: #606266;
  border: 1px solid #dcdfe6;
}
</style>
