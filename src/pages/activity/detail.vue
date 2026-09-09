<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import {
  getActivityDetailApi,
  signupActivityApi,
  cancelSignupActivityApi,
  type ActivityItem
} from '@/api/activity'

const activityId = ref<number>(1)
const loading = ref(false)
const submitting = ref(false)
const activity = ref<ActivityItem | null>(null)

const fetchDetail = async () => {
  if (!activityId.value) return
  loading.value = true
  try {
    const res = await getActivityDetailApi(activityId.value)
    activity.value = res
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取活动详情失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

// 报名状态判断
const isFull = computed(() => {
  if (!activity.value) return false
  return activity.value.enrolledCount >= activity.value.registrationLimit
})

const myStatus = computed(() => activity.value?.myEnrollmentStatus || 'NONE')

// 处理报名或候补申请
const handleEnrollAction = async () => {
  if (!activity.value || submitting.value) return
  const act = activity.value

  // 如果已完成
  if (myStatus.value === 'COMPLETED') {
    uni.showToast({ title: '您已完成本次活动打卡考勤', icon: 'none' })
    return
  }

  // 如果已经是正式报名状态 -> 引导去打卡
  if (myStatus.value === 'ENROLLED') {
    uni.navigateTo({
      url: `/pages/activity/checkin?actId=${act.id}`
    })
    return
  }

  // 如果在候补队列中 -> 确认是否退出候补
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
          fetchDetail()
        } catch (err: any) {
          uni.showToast({ title: err.message || '操作失败', icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
    return
  }

  // 未报名情况：名额充足直接报名，名额满额申请候补
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
          uni.showToast({ title: res.message || '候补成功', icon: 'success' })
          fetchDetail()
        } catch (err: any) {
          uni.showToast({ title: err.message || '候补申请失败', icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
  } else {
    // 正式名额直接报名
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
          uni.showToast({ title: res.message || '报名成功', icon: 'success' })
          fetchDetail()
        } catch (err: any) {
          uni.showToast({ title: err.message || '报名失败', icon: 'none' })
        } finally {
          submitting.value = false
        }
      }
    })
  }
}

// 主动取消正式报名
const handleCancelSignup = () => {
  if (!activity.value || submitting.value) return
  const act = activity.value

  uni.showModal({
    title: '取消报名确认',
    content: '确定要取消本次活动正式报名吗？取消后名额将自动释放并顺延给候补队列排第 1 位的同学。',
    confirmText: '确认取消',
    cancelText: '保留名额',
    confirmColor: '#f56c6c',
    success: async (mRes) => {
      if (!mRes.confirm) return
      submitting.value = true
      try {
        await cancelSignupActivityApi(act.id)
        uni.showToast({ title: '已取消报名，名额已释放', icon: 'success' })
        fetchDetail()
      } catch (err: any) {
        uni.showToast({ title: err.message || '取消失败', icon: 'none' })
      } finally {
        submitting.value = false
      }
    }
  })
}

// 直接前往打卡
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

onShow(() => {
  fetchDetail()
})
</script>

<template>
  <view class="detail-page-shell">
    <view v-if="activity" class="detail-content">
      <!-- 头部 Hero (深蓝旗舰渐变) -->
      <view class="detail-hero-box">
        <view class="hero-tag-row">
          <text class="hero-tag tag-primary">{{ activity.categoryName || '学术科技' }}</text>
          <text v-if="activity.certificateEnabled" class="hero-tag tag-warning">颁发荣誉证书</text>
        </view>
        <view class="hero-title">{{ activity.title }}</view>
        <view class="hero-organizer">
          主办单位：{{ activity.certificateIssuer || '学生工作处 / 团委社团部' }}
        </view>
      </view>

      <!-- 核心信息卡片 -->
      <view class="detail-body-container">
        <!-- 积分与名额双指标卡片 -->
        <view class="uni-card quota-points-card">
          <view class="quota-points-left">
            <view class="meta-label">出勤奖励学分</view>
            <view class="meta-points-val">
              +{{ activity.points }}
              <text class="pts-unit">pts</text>
            </view>
          </view>
          <view class="quota-points-right">
            <view class="meta-label">正选名额状态</view>
            <view class="quota-number-line">
              {{ activity.enrolledCount }} / {{ activity.registrationLimit }} 人
              <text v-if="isFull && activity.waitlistEnabled" class="badge-waitlist">候补开放</text>
              <text v-else-if="!isFull" class="badge-available">名额充裕</text>
              <text v-else class="badge-full">已满额</text>
            </view>
          </view>
        </view>

        <!-- 我的参与状态提示条 -->
        <view v-if="myStatus !== 'NONE'" class="my-status-banner" :class="`banner-${myStatus}`">
          <view v-if="myStatus === 'ENROLLED'" class="status-tip-row">
            <text class="tip-icon">✅</text>
            <view class="tip-text-box">
              <view class="tip-strong">您已正式报名成功！</view>
              <view class="tip-desc">请于活动开始前到达指定地点，扫码核验出勤。</view>
            </view>
            <view class="tip-action-btn" @click="handleCancelSignup">退报</view>
          </view>
          <view v-else-if="myStatus === 'WAITLIST'" class="status-tip-row">
            <text class="tip-icon">⏳</text>
            <view class="tip-text-box">
              <view class="tip-strong">
                正在候补排队中（当前第 {{ activity.myQueueNumber || 1 }} 位）
              </view>
              <view class="tip-desc">一旦有正选同学取消，系统将自动顺延递补。</view>
            </view>
          </view>
          <view v-else-if="myStatus === 'COMPLETED'" class="status-tip-row">
            <text class="tip-icon">🎉</text>
            <view class="tip-text-box">
              <view class="tip-strong">已完成本次活动打卡！</view>
              <view class="tip-desc">+{{ activity.points }} 积分已入账至可用学分余额。</view>
            </view>
          </view>
        </view>

        <!-- 起止时间与地点 -->
        <view class="uni-card meta-info-card">
          <view class="meta-cell">
            <text class="cell-icon">🕒</text>
            <view class="cell-content">
              <view class="cell-title">活动起止时间</view>
              <view class="cell-desc">
                {{ activity.startTime }} 至 {{ activity.endTime }}
              </view>
            </view>
          </view>

          <view class="meta-cell">
            <text class="cell-icon">📍</text>
            <view class="cell-content">
              <view class="cell-title">活动地点与考勤围栏</view>
              <view class="cell-desc">
                {{ activity.locationName }}
                <text v-if="activity.locationCheckEnabled">
                  （GPS 核验半径: {{ activity.locationRadius }}米）
                </text>
              </view>
            </view>
          </view>

          <!-- 科技风 GPS 雷达围栏模拟预览 -->
          <view v-if="activity.locationCheckEnabled" class="gps-radar-preview">
            <view class="radar-circle">
              <text class="radar-text">考勤半径 ≤ {{ activity.locationRadius }}m</text>
            </view>
            <view class="radar-center-marker">📍</view>
            <view class="radar-coords-tag">
              基准点：{{ activity.longitude }}, {{ activity.latitude }}
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
            <view class="notice-title">💡 出勤考勤须知：</view>
            <view class="notice-content">
              {{ activity.ruleDescription || '现场大屏幕将展示动态防盗刷签到二维码（每10秒自动轮换）。学生到达活动现场并在考勤地理范围内完成扫码即可获得积分奖励。' }}
            </view>
          </view>
        </view>
      </view>

      <!-- 底部固定操作栏 -->
      <view class="bottom-fix-bar">
        <!-- 如果已报名，提供打卡和退报双操作 -->
        <template v-if="myStatus === 'ENROLLED'">
          <button class="enroll-btn btn-secondary" @click="handleCancelSignup">
            取消报名
          </button>
          <button class="enroll-btn btn-primary" @click="goToCheckin">
            现场扫码打卡签到
          </button>
        </template>

        <!-- 如果在候补队列中 -->
        <template v-else-if="myStatus === 'WAITLIST'">
          <button class="enroll-btn btn-warning" @click="handleEnrollAction">
            已在候补队列（排第 {{ activity.myQueueNumber || 1 }} 位 · 点击退出）
          </button>
        </template>

        <!-- 如果已完成打卡 -->
        <template v-else-if="myStatus === 'COMPLETED'">
          <button class="enroll-btn btn-success" disabled>
            ✅ 已完成本次活动出勤打卡
          </button>
        </template>

        <!-- 正常未报名状态 -->
        <template v-else>
          <button
            v-if="!isFull"
            class="enroll-btn btn-primary"
            :disabled="submitting"
            @click="handleEnrollAction"
          >
            立即报名参加 (+{{ activity.points }} pts)
          </button>
          <button
            v-else-if="activity.waitlistEnabled"
            class="enroll-btn btn-warning"
            :disabled="submitting"
            @click="handleEnrollAction"
          >
            名额已满 · 申请候补排队 (预排第 {{ (activity.waitlistCount || 0) + 1 }} 位)
          </button>
          <button
            v-else
            class="enroll-btn btn-disabled"
            disabled
          >
            名额已满额 (未开放候补)
          </button>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped>
.detail-page-shell {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 120rpx;
}

/* 头部 Hero */
.detail-hero-box {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  color: #ffffff;
  padding: 36rpx 28rpx 40rpx;
}

.hero-tag-row {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.hero-tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}

.tag-primary {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.tag-warning {
  background-color: #e6a23c;
  color: #ffffff;
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
  justify-content: space-between;
  align-items: center;
}

.meta-label {
  font-size: 22rpx;
  color: #909399;
  margin-bottom: 4rpx;
}

.meta-points-val {
  font-size: 40rpx;
  font-weight: 700;
  color: #e6a23c;
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
  border-radius: 6rpx;
}

.badge-waitlist {
  background-color: #fdf6ec;
  color: #e6a23c;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.badge-full {
  background-color: #f4f4f5;
  color: #909399;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
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

.tip-icon {
  font-size: 36rpx;
}

.tip-text-box {
  flex: 1;
}

.tip-strong {
  font-size: 26rpx;
  font-weight: 700;
}

.tip-desc {
  font-size: 22rpx;
  opacity: 0.85;
  margin-top: 4rpx;
}

.tip-action-btn {
  font-size: 22rpx;
  color: #f56c6c;
  border: 1px solid #fbc4c4;
  background-color: #fef0f0;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
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

.cell-icon {
  font-size: 32rpx;
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
  height: 300rpx;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12rpx;
  margin-top: 10rpx;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 28rpx 28rpx;
}

.radar-circle {
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  border: 3rpx dashed #409eff;
  background-color: rgba(64, 158, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
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
  transform: translate(-50%, -60%);
  font-size: 32rpx;
}

.radar-coords-tag {
  position: absolute;
  bottom: 12rpx;
  left: 16rpx;
  font-size: 20rpx;
  color: #64748b;
  background: rgba(255, 255, 255, 0.92);
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
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
  line-height: 1.65;
}

.attendance-notice-box {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #fdf6ec;
  border-radius: 10rpx;
  border: 1px solid #faecd8;
}

.notice-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 6rpx;
}

.notice-content {
  font-size: 22rpx;
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
}

.enroll-btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  color: #ffffff;
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

.btn-disabled {
  background-color: #c0c4cc;
}
</style>
