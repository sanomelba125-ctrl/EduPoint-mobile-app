<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onLoad, onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import {
  getActivityDetailApi,
  signupActivityApi,
  cancelSignupActivityApi,
  getActivityStatusInfo,
  type ActivityItem,
  type ActivityStatusInfo
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'

const activityId = ref<number>(1)
const loading = ref(false)
const submitting = ref(false)
const activity = ref<ActivityItem | null>(null)
let pollTimer: any = null

/**
 * 获取活动详情
 * @param silent 是否静默刷新（并发轮询与下拉刷新时不阻断页面、不闪烁加载框）
 */
const fetchDetail = async (silent = false) => {
  if (!activityId.value) return
  if (!silent && !activity.value) {
    loading.value = true
  }
  try {
    const res = await getActivityDetailApi(activityId.value)
    activity.value = res
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

/** 启动高频平滑短轮询（2秒/次），保持并发高频场景下名额与排队数与主页完全一致 */
const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(() => {
    fetchDetail(true)
  }, 2000)
}

/** 停止轮询 */
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 报名状态与人数进度计算
const enrolledCount = computed(() => {
  if (!activity.value) return 0
  const raw = (activity.value as any).participantCount !== undefined ? (activity.value as any).participantCount : activity.value.enrolledCount
  return raw !== undefined && raw !== null ? Number(raw) : 0
})

const isFull = computed(() => {
  if (!activity.value) return false
  return enrolledCount.value >= (activity.value.registrationLimit || 1)
})

const progressPercent = computed(() => {
  if (!activity.value || !activity.value.registrationLimit) return 0
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
    uni.showModal({
      title: '退出候补队列',
      content: '确认退出当前候补排队吗？退出后若重新候补需要重新按顺序排队。',
      confirmText: '退出候补',
      cancelText: '再想想',
      success: async (mRes) => {
        if (!mRes.confirm) return
        submitting.value = true
        try {
          await cancelSignupActivityApi(act.id)
          uni.showToast({ title: '已退出候补队列', icon: 'success' })
          fetchDetail(true)
        } catch (err: any) {
          uni.showToast({ title: getApiErrorMessage(err, '退出候补失败'), icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
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

  uni.showModal({
    title: isWait ? '退出候补确认' : '取消报名确认',
    content: isWait
      ? '确定要退出当前活动的候补排队吗？退出后若重新候补需要重新排队。'
      : '确定要取消本次活动正式报名吗？取消后名额将自动释放并顺延给候补队列排第 1 位的同学。',
    confirmText: isWait ? '退出候补' : '确认取消',
    cancelText: isWait ? '再想想' : '保留名额',
    confirmColor: '#f56c6c',
    success: async (mRes) => {
      if (!mRes.confirm) return
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
})

onPullDownRefresh(async () => {
  await fetchDetail(true)
  uni.stopPullDownRefresh()
})

onShow(() => {
  fetchDetail(activity.value ? true : false)
  startPolling()
})

onHide(() => {
  stopPolling()
})

onUnload(() => {
  stopPolling()
})

// 监听多标签并发测试焦点切换事件
const handleVisibilityChange = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    fetchDetail(true)
  }
}

const handleWindowFocus = () => {
  fetchDetail(true)
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  stopPolling()
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleWindowFocus)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>

<template>
  <view class="detail-page-shell">
    <view v-if="activity" class="detail-content">
      <!-- 头部 Hero (深蓝旗舰渐变) -->
      <view class="detail-hero-box">
        <view class="hero-tag-row">
          <text class="hero-tag tag-primary">{{ activity.categoryName || '学术科技' }}</text>
          <text class="hero-tag" :class="`tag-status-${statusInfo.statusType}`">
            {{ statusInfo.statusLabel }}
          </text>
          <text v-if="activity.certificateEnabled" class="hero-tag tag-warning">颁发结业证书</text>
          <view class="live-sync-indicator">
            <view class="live-dot" />
            <text class="live-text">实时同步中</text>
          </view>
        </view>
        <view class="hero-title">{{ activity.title }}</view>
        <view class="hero-organizer">
          主办单位：{{ activity.certificateIssuer || '学生工作处 / 校团委' }}
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
                <text class="pts-unit">pts</text>
              </view>
            </view>
            <view class="quota-points-right">
              <view class="meta-label">正选名额状态</view>
              <view class="quota-number-line">
                {{ enrolledCount }} / {{ activity.registrationLimit }}
                <text v-if="isFull && activity.waitlistEnabled" class="badge-waitlist">可候补</text>
                <text v-else-if="!isFull" class="badge-available">名额充裕</text>
                <text v-else class="badge-full">已满额</text>
              </view>
            </view>
          </view>

          <!-- 直观报名进度条 -->
          <view class="detail-progress-wrap">
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
                正在候补排队中（当前排第 {{ activity.myQueueNumber || 1 }} 位）
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
              <view class="tip-desc">+{{ activity.points }} 积分已即时入账至可用学分余额。</view>
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

          <view class="meta-cell">
            <svg class="cell-svg" viewBox="0 0 24 24">
              <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
            </svg>
            <view class="cell-content">
              <view class="cell-title">活动地点与考勤围栏</view>
              <view class="cell-desc">
                {{ activity.locationName }}
                <text v-if="activity.locationCheckEnabled">
                  （GPS 范围: ≤ {{ activity.locationRadius }}米内）
                </text>
              </view>
            </view>
          </view>

          <!-- 科技风 GPS 雷达围栏模拟预览 -->
          <view v-if="activity.locationCheckEnabled" class="gps-radar-preview">
            <view class="radar-circle">
              <view class="radar-ping-ring" />
              <text class="radar-text">核验半径 {{ activity.locationRadius }}m</text>
            </view>
            <view class="radar-center-marker">
              <svg class="marker-svg" viewBox="0 0 24 24">
                <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
              </svg>
            </view>
            <view class="radar-coords-tag">
              基准点: {{ activity.longitude }}, {{ activity.latitude }}
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
              {{ activity.ruleDescription || '现场大屏将展示动态防盗刷二维码（每10秒自动轮换），学生到达现场在 500 米定位范围内扫码即可完成出勤核验。' }}
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
  </view>
</template>

<style scoped>
.detail-page-shell {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 128rpx;
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
  background-color: #e6a23c;
  color: #ffffff;
}

/* 实时同步指示器 */
.live-sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  color: #e2e8f0;
  margin-left: auto;
}

.live-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8rpx #10b981;
  animation: livePulse 2s infinite ease-in-out;
}

@keyframes livePulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
    box-shadow: 0 0 12rpx #34d399;
  }
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
  border: 1px solid #ebeef5;
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
  color: #909399;
  margin-bottom: 4rpx;
}

.meta-points-val {
  font-size: 44rpx;
  font-weight: 700;
  color: #e6a23c;
  line-height: 1;
}

.pts-unit {
  font-size: 24rpx;
  font-weight: normal;
  color: #909399;
  margin-left: 6rpx;
}

.quota-points-right {
  text-align: right;
}

.quota-number-line {
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 6rpx;
}

.badge-available {
  background-color: #f0f9eb;
  color: #67c23a;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #c2e7b0;
}

.badge-waitlist {
  background-color: #fdf6ec;
  color: #e6a23c;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #f5dab1;
}

.badge-full {
  background-color: #f4f4f5;
  color: #909399;
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
  background-color: #409eff;
  border-radius: 5rpx;
  transition: width 0.3s ease;
}

.detail-progress-fill.full {
  background-color: #e6a23c;
}

.detail-progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #909399;
}

.progress-sub {
  color: #606266;
}

.progress-percent {
  font-weight: 700;
  color: #409eff;
}

.progress-percent.full-text {
  color: #e6a23c;
}

/* 我的报名状态提示 */
.my-status-banner {
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
}

.banner-ENROLLED {
  background-color: #ecf5ff;
  border: 1px solid #b3d8ff;
  color: #409eff;
}

.banner-WAITLIST {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  color: #e6a23c;
}

.banner-COMPLETED {
  background-color: #f0f9eb;
  border: 1px solid #c2e7b0;
  color: #67c23a;
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

.tip-svg-success { fill: #409eff; }
.tip-svg-warning { fill: #e6a23c; }
.tip-svg-completed { fill: #67c23a; }

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
  color: #f56c6c;
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
  fill: #909399;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.cell-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
}

.cell-desc {
  font-size: 24rpx;
  color: #606266;
  margin-top: 4rpx;
}

/* GPS 雷达围栏模拟预览 */
.gps-radar-preview {
  width: 100%;
  height: 320rpx;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12rpx;
  margin-top: 10rpx;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-image: radial-gradient(#cbd5e1 1.5px, transparent 1.5px);
  background-size: 28rpx 28rpx;
}

.radar-circle {
  width: 210rpx;
  height: 210rpx;
  border-radius: 50%;
  border: 2rpx dashed #409eff;
  background-color: rgba(64, 158, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.radar-text {
  font-size: 20rpx;
  color: #409eff;
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
  fill: #f56c6c;
}

.radar-coords-tag {
  position: absolute;
  bottom: 12rpx;
  left: 16rpx;
  font-size: 20rpx;
  color: #64748b;
  background: rgba(255, 255, 255, 0.92);
  padding: 4rpx 14rpx;
  border-radius: 4rpx;
  border: 1px solid #e2e8f0;
}

/* 大纲与出勤须知 */
.card-section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 14rpx;
}

.section-paragraph {
  font-size: 26rpx;
  color: #606266;
  line-height: 1.7;
}

.attendance-notice-box {
  margin-top: 20rpx;
  padding: 20rpx;
  background-color: #fdf6ec;
  border-radius: 8rpx;
  border: 1px solid #faecd8;
}

.notice-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #e6a23c;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
}

.notice-svg {
  width: 28rpx;
  height: 28rpx;
  fill: #e6a23c;
}

.notice-content {
  font-size: 23rpx;
  color: #909399;
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
  border-top: 1px solid #ebeef5;
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
  background-color: #409eff;
}

.btn-warning {
  background-color: #e6a23c;
}

.btn-success {
  background-color: #67c23a;
}

.btn-secondary {
  background-color: #fef0f0;
  border: 1px solid #fbc4c4;
  color: #f56c6c;
  flex: 0 0 200rpx;
}

.btn-danger-outline {
  background-color: #fef0f0;
  border: 1px solid #fbc4c4;
  color: #f56c6c;
  flex: 0 0 190rpx;
}

.btn-enrolled-disabled {
  background-color: #e4e7ed !important;
  border: 1px solid #dcdfe6 !important;
  color: #909399 !important;
  cursor: not-allowed;
  flex: 0 0 160rpx;
}

.btn-warning-outline {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  color: #e6a23c;
  flex: 0 0 190rpx;
}

.btn-warning-disabled {
  background-color: #faecd8 !important;
  border: 1px solid #f5dab1 !important;
  color: #e6a23c !important;
  cursor: not-allowed;
}

.btn-disabled {
  background-color: #c0c4cc;
}

.btn-success-disabled {
  background-color: #f0f9eb !important;
  border: 1px solid #c2e7b0 !important;
  color: #67c23a !important;
  cursor: not-allowed;
}

.btn-info-outline {
  background-color: #f4f4f5 !important;
  border: 1px solid #dcdfe6 !important;
  color: #606266 !important;
}

.tag-status-success {
  background-color: #67c23a;
  color: #ffffff;
}

.tag-status-warning {
  background-color: #e6a23c;
  color: #ffffff;
}

.tag-status-info {
  background-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}
</style>
