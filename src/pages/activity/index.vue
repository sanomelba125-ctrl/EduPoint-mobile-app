<script setup lang="ts">
import { ref, computed } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import {
  getActivityPageApi,
  signupActivityApi,
  cancelSignupActivityApi,
  getActivityStatusInfo,
  isActivityFull,
  promptCancelSignupModal,
  type ActivityItem,
  type ActivityStatusInfo
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import { getUnreadNoticeCountApi } from '@/api/notice'

// 5 大活动分类
const CATEGORIES = [
  { key: 'ALL', name: '全部活动' },
  { key: 'ACADEMIC', name: '学术科技' },
  { key: 'VOLUNTEER', name: '志愿公益' },
  { key: 'SPORTS', name: '体育竞技' },
  { key: 'PRACTICE', name: '实践文娱' },
  { key: 'OTHER', name: '其他拓展' }
]

const currentCategory = ref('ALL')
const searchKeyword = ref('')
const loading = ref(false)
const activityList = ref<ActivityItem[]>([])

const fetchActivities = async () => {
  loading.value = true
  try {
    const res = await getActivityPageApi({
      category: currentCategory.value === 'ALL' ? undefined : currentCategory.value,
      keyword: searchKeyword.value.trim() || undefined,
      page: 1,
      size: 50
    })
    activityList.value = res.records || []
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取活动列表失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleCategorySelect = (key: string) => {
  currentCategory.value = key
  fetchActivities()
}

const handleSearchInput = (e: any) => {
  searchKeyword.value = e.detail?.value ?? ''
  fetchActivities()
}

const handleClearSearch = () => {
  searchKeyword.value = ''
  fetchActivities()
}

// 重点推荐活动 (优先取有证书或高积分)
const featuredActivity = computed(() => {
  if (activityList.value.length === 0) return null
  return activityList.value.find(a => a.certificateEnabled === 1) || activityList.value[0]
})

const getPercent = (enrolled: number, limit: number) => {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.round((enrolled / limit) * 100))
}

const getStatusBadge = (act: ActivityItem) => {
  const info = getActivityStatusInfo(act)
  return { text: info.statusLabel, type: info.statusType }
}

const goToDetail = (id: number) => {
  uni.navigateTo({
    url: `/pages/activity/detail?id=${id}`
  })
}

const goToCheckin = (actId?: any) => {
  const validId = typeof actId === 'number' && actId > 0 ? actId : null
  uni.navigateTo({
    url: validId ? `/pages/activity/checkin?actId=${validId}` : '/pages/activity/checkin'
  })
}

const goToMyRecords = () => {
  uni.navigateTo({
    url: '/pages/activity/records'
  })
}

const goToAiChat = () => {
  uni.navigateTo({
    url: '/pages/ai-chat/index'
  })
}

const unreadNoticeCount = ref(0)

const fetchUnreadNoticeCount = async () => {
  try {
    const count = await getUnreadNoticeCountApi()
    unreadNoticeCount.value = count || 0
  } catch (err) {
    // 忽略异常
  }
}

const goToNotices = () => {
  uni.navigateTo({
    url: '/pages/notice/index'
  })
}

// 主页直接取消报名/退出候补
const handleCancelSignup = (act: ActivityItem) => {
  const isWait = act.myEnrollmentStatus === 'WAITLIST'
  promptCancelSignupModal({
    title: act.title,
    isWaitlist: isWait,
    onConfirm: async () => {
      uni.showLoading({ title: '正在取消...', mask: true })
      try {
        const message = await cancelSignupActivityApi(act.id)
        uni.hideLoading()
        uni.showToast({ title: message || (isWait ? '已退出候补' : '已取消报名'), icon: 'success' })
        fetchActivities()
      } catch (err: any) {
        uni.hideLoading()
        uni.showToast({ title: getApiErrorMessage(err, '取消失败'), icon: 'none' })
      }
    }
  })
}

// 主页直接报名/申请候补
const handleQuickSignup = (act: ActivityItem) => {
  const isFull = isActivityFull(act)
  if (isFull && !act.waitlistEnabled) {
    uni.showToast({ title: '名额已满额，未开放候补', icon: 'none' })
    return
  }

  uni.showModal({
    title: isFull ? '申请候补确认' : '确认报名活动',
    content: isFull
      ? `正选名额已满，确认进入候补队列吗？\n当前排队序号预估为第 ${(act.waitlistCount || 0) + 1} 位。`
      : `确认报名「${act.title}」吗？\n出勤完成后可获得 +${act.points} 积分奖励。`,
    confirmText: isFull ? '确认候补' : '立即报名',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return
      uni.showLoading({ title: '正在提交...', mask: true })
      try {
        const signRes = await signupActivityApi(act.id)
        uni.hideLoading()
        uni.showToast({ title: signRes?.message || (isFull ? '候补申请成功' : '报名成功'), icon: 'success' })
        fetchActivities()
      } catch (err: any) {
        uni.hideLoading()
        uni.showToast({ title: getApiErrorMessage(err, isFull ? '候补申请失败' : '报名失败'), icon: 'none' })
      }
    }
  })
}

// 卡片按钮操作调度（根据活动状态执行相应功能）
const handleCardAction = (act: ActivityItem, info: ActivityStatusInfo) => {
  if (info.disabled) return
  if (info.actionType === 'CHECKIN') {
    goToCheckin(act.id)
    return
  }
  if (info.actionType === 'WAIT_START') {
    uni.showToast({ title: '活动尚未开展，请于活动进行期间前往现场打卡', icon: 'none' })
    return
  }
  if (info.actionType === 'SIGNUP' || info.actionType === 'WAITLIST') {
    handleQuickSignup(act)
    return
  }
}

onPullDownRefresh(() => {
  fetchActivities()
  fetchUnreadNoticeCount()
})

onShow(() => {
  fetchActivities()
  fetchUnreadNoticeCount()
})
</script>

<template>
  <view class="hall-container">
    <!-- 顶部综合操作区：搜索 + 扫码打卡入口 -->
    <view class="search-top-bar">
      <view class="search-input-box">
        <svg class="icon-svg search-icon" viewBox="0 0 24 24">
          <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
        </svg>
        <input
          class="search-input"
          type="text"
          :value="searchKeyword"
          placeholder="搜索学术讲座、志愿公益、体育竞赛..."
          @input="handleSearchInput"
        />
        <view v-if="searchKeyword" class="clear-btn" @click="handleClearSearch">
          <svg class="icon-svg" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
          </svg>
        </view>
      </view>

      <!-- 消息通知快捷铃铛入口 -->
      <view class="notice-quick-btn" @click="goToNotices">
        <svg class="icon-svg bell-svg" viewBox="0 0 24 24">
          <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22M18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
        </svg>
        <view v-if="unreadNoticeCount > 0" class="bell-badge">
          {{ unreadNoticeCount > 99 ? '99+' : unreadNoticeCount }}
        </view>
      </view>

      <view class="checkin-quick-btn" @click="goToCheckin()">
        <svg class="icon-svg checkin-svg" viewBox="0 0 24 24">
          <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
        </svg>
        <text class="qr-text">现场打卡</text>
      </view>
    </view>

    <!-- 分类横滑标签（外层加右侧渐隐，提示可横向滑动，同时避免末位标签被硬切断） -->
    <view class="category-bar-wrap">
      <scroll-view class="category-scroll-bar" scroll-x :show-scrollbar="false">
        <view class="cat-pill-wrap">
          <view
            v-for="cat in CATEGORIES"
            :key="cat.key"
            class="cat-pill"
            :class="{ active: currentCategory === cat.key }"
            @click="handleCategorySelect(cat.key)"
          >
            {{ cat.name }}
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 大厅功能快速联动条：我的参与记录快捷入口 -->
    <view class="quick-entry-row">
      <view class="entry-sub-title">校园活动全景广场</view>
      <view class="entry-link" @click="goToMyRecords">
        <text class="link-text">我的活动记录</text>
        <svg class="icon-svg arrow-svg" viewBox="0 0 24 24">
          <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
        </svg>
      </view>
    </view>

    <!-- 焦点推荐活动 Banner (高校旗舰深蓝) -->
    <view
      v-if="featuredActivity && !searchKeyword && currentCategory === 'ALL'"
      class="featured-banner"
      @click="goToDetail(featuredActivity.id)"
    >
      <view class="banner-top">
        <text class="banner-badge">
          {{ featuredActivity.certificateEnabled ? '重点学术讲座 · 颁发结业证书' : '热门重点推荐' }}
        </text>
        <text class="banner-points">+{{ featuredActivity.points }} 积分</text>
      </view>
      <view class="banner-title">{{ featuredActivity.title }}</view>
      <view class="banner-desc">
        时间：{{ featuredActivity.startTime.slice(5, 16) }} | 地点：{{ featuredActivity.locationName }}
      </view>
    </view>

    <!-- 活动卡片流 -->
    <view class="activity-list-wrap">
      <view
        v-for="act in activityList"
        :key="act.id"
        class="act-item-card"
        @click="goToDetail(act.id)"
      >
        <!-- 头部元数据 -->
        <view class="act-top-meta">
          <view class="tags-left">
            <text class="tag-badge tag-primary">{{ act.categoryName || '校园活动' }}</text>
            <text v-if="act.certificateEnabled" class="tag-badge tag-cert">颁发证书</text>
          </view>
          <text class="status-badge" :class="`status-${getStatusBadge(act).type}`">
            {{ getStatusBadge(act).text }}
          </text>
        </view>

        <!-- 标题 -->
        <view class="act-card-title">{{ act.title }}</view>

        <!-- 时间与地点 (SVG 图标替代 Emoji) -->
        <view class="act-card-row">
          <svg class="icon-svg row-svg" viewBox="0 0 24 24">
            <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
          </svg>
          <text class="row-text">{{ act.startTime.slice(5, 16) }} 至 {{ act.endTime.slice(11, 16) }}</text>
        </view>
        <view class="act-card-row">
          <svg class="icon-svg row-svg" viewBox="0 0 24 24">
            <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
          </svg>
          <text class="row-text">{{ act.locationName }}</text>
        </view>

        <!-- 报名进度条 (直观展示当前报名人数/总人数及进度) -->
        <view class="act-progress-track">
          <view
            class="act-progress-fill"
            :class="{ full: isActivityFull(act) }"
            :style="{ width: `${getPercent(act.enrolledCount, act.registrationLimit)}%` }"
          />
        </view>

        <!-- 底部说明与积分奖励 -->
        <view class="act-bottom-info">
          <view class="enrolled-quota">
            <text>名额 {{ act.enrolledCount }} / {{ act.registrationLimit }} 人</text>
            <text v-if="isActivityFull(act) && act.waitlistEnabled" class="waitlist-hint">
              · 可候补{{ act.waitlistCount ? ` (${act.waitlistCount}人排队)` : '' }}
            </text>
          </view>
          <text class="points-val">+{{ act.points }} 积分</text>
        </view>
      </view>

      <!-- 空状态 -->
      <app-empty
        v-if="!loading && activityList.length === 0"
        icon="folder"
        title="暂无符合条件的校园活动"
        desc="试试切换上方的分类，或下拉刷新看看新发布的活动"
      />
    </view>

    <!-- 全局悬浮 AI 智能客服入口 -->
    <view class="floating-ai-btn" @click="goToAiChat">
      <view class="ai-pulse-ring"></view>
      <app-icon name="bot" :size="44" color="#ffffff" />
      <text class="ai-btn-label">AI客服</text>
    </view>
  </view>
</template>

<style scoped>
.hall-container {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

/* 基础通用矢量 SVG 规范 */
.icon-svg {
  width: 32rpx;
  height: 32rpx;
  fill: currentColor;
  flex-shrink: 0;
}

/* 顶部搜索与扫码打卡入口 */
.search-top-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  background-color: #ffffff;
  border-bottom: 1px solid #f0f2f5;
}

.search-input-box {
  flex: 1;
  display: flex;
  align-items: center;
  background-color: #f4f5f7;
  border-radius: 36rpx;
  padding: 0 20rpx;
  height: 72rpx;
  transition: all 0.2s ease;
}

.search-input-box:focus-within {
  background-color: #ffffff;
  box-shadow: 0 0 0 1px #2563eb;
}

.search-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 12rpx;
  fill: #64748b;
}

.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #1e293b;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36rpx;
  height: 36rpx;
}

.clear-btn .icon-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #a8abb2;
}

.checkin-quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background-color: #eff6ff;
  border: 1px solid #c6e2ff;
  color: #2563eb;
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 36rpx;
  cursor: pointer;
  transition: all 0.15s ease;
}

.checkin-quick-btn:active {
  transform: scale(0.97);
  background-color: #d9ecff;
}

.checkin-svg {
  width: 28rpx;
  height: 28rpx;
  fill: #2563eb;
}

.qr-text {
  font-size: 25rpx;
  font-weight: 600;
}

/* 5 大分类横滑标签 */
.category-bar-wrap {
  position: relative;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

/* 右侧渐隐遮罩：既是"还能继续滑动"的视觉提示，
   也让末位标签以淡出收尾，而不是被硬生生切掉一半 */
.category-bar-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 64rpx;
  background: linear-gradient(to right, rgba(255, 255, 255, 0), #ffffff 80%);
  pointer-events: none;
  z-index: 2;
}

.category-scroll-bar {
  background-color: transparent;
  white-space: nowrap;
}

.cat-pill-wrap {
  display: flex;
  padding: 16rpx 24rpx;
  gap: 16rpx;
}

.cat-pill {
  display: inline-block;
  padding: 10rpx 24rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: #475569;
  background-color: #f4f4f5;
  border: 1px solid #e9e9eb;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.cat-pill.active {
  background-color: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(64, 158, 255, 0.35);
}

/* 快速入口条 */
.quick-entry-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 24rpx 10rpx;
}

.entry-sub-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.5rpx;
}

.entry-link {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 500;
}

.arrow-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #2563eb;
}

/* 焦点活动推荐 Banner (高校严谨深蓝) */
.featured-banner {
  margin: 12rpx 24rpx;
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  border-radius: 16rpx;
  padding: 26rpx;
  color: #ffffff;
  box-shadow: 0 4rpx 20rpx rgba(30, 58, 138, 0.28);
  transition: transform 0.2s ease;
}

.featured-banner:active {
  transform: scale(0.99);
}

.banner-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.banner-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
  font-weight: 500;
  letter-spacing: 0.5rpx;
}

.banner-points {
  font-size: 28rpx;
  font-weight: 700;
  color: #fcd34d;
}

.banner-title {
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
  line-height: 1.35;
}

.banner-desc {
  font-size: 23rpx;
  color: #cbd5e1;
}

/* 活动卡片列表 */
.activity-list-wrap {
  /* 底部留出 180rpx：右下角常驻的 AI 客服悬浮球（fixed，直径 104rpx + 距底 140rpx）
     会盖住最后一张活动卡片的名额与积分，留白保证卡片能完整滚出遮挡区 */
  padding: 12rpx 24rpx 180rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.act-item-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 1px solid #e2e8f0;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.act-item-card:active {
  transform: scale(0.99);
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.05);
}

.act-top-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}

.tags-left {
  display: flex;
  gap: 10rpx;
}

.tag-badge {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-weight: 500;
}

.tag-primary {
  background-color: #eff6ff;
  color: #2563eb;
  border: 1px solid #d9ecff;
}

.tag-cert {
  background-color: #fffbeb;
  color: #f59e0b;
  border: 1px solid #faecd8;
}

.status-badge {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-weight: 500;
}

.status-success {
  background-color: #ecfdf5;
  color: #10b981;
  border: 1px solid #c2e7b0;
}

.status-warning {
  background-color: #fffbeb;
  color: #f59e0b;
  border: 1px solid #f5dab1;
}

.status-info {
  background-color: #f4f4f5;
  color: #64748b;
  border: 1px solid #e9e9eb;
}

.status-primary {
  background-color: #eff6ff;
  color: #2563eb;
  border: 1px solid #d9ecff;
}

.act-card-title {
  font-size: 29rpx;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.4;
  margin-bottom: 14rpx;
}

.act-card-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
  color: #475569;
  margin-bottom: 8rpx;
}

.row-svg {
  width: 26rpx;
  height: 26rpx;
  fill: #64748b;
}

.row-text {
  flex: 1;
}

.act-progress-track {
  height: 8rpx;
  background-color: #f0f2f5;
  border-radius: 4rpx;
  overflow: hidden;
  margin: 18rpx 0 12rpx;
}

.act-progress-fill {
  height: 100%;
  background-color: #2563eb;
  border-radius: 4rpx;
  transition: width 0.3s ease;
}

.act-progress-fill.full {
  background-color: #f59e0b;
}

.act-bottom-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24rpx;
}

.enrolled-quota {
  color: #64748b;
  font-weight: 500;
}

.waitlist-hint {
  color: #f59e0b;
  margin-left: 6rpx;
}

.points-val {
  color: #f59e0b;
  font-weight: 700;
  font-size: 28rpx;
}

/* 空状态 */



/* 悬浮 AI 智能客服入口 */
.floating-ai-btn {
  position: fixed;
  right: 32rpx;
  bottom: 140rpx;
  z-index: 99;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 8rpx 28rpx rgba(37, 99, 235, 0.45);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.floating-ai-btn:active {
  transform: scale(0.92);
}

.ai-pulse-ring {
  position: absolute;
  top: -6rpx;
  left: -6rpx;
  right: -6rpx;
  bottom: -6rpx;
  border-radius: 50%;
  border: 2px solid rgba(59, 130, 246, 0.5);
  animation: aiRingPulse 2.4s infinite ease-out;
  pointer-events: none;
}

@keyframes aiRingPulse {
  0% { transform: scale(1); opacity: 0.8; }
  70% { transform: scale(1.28); opacity: 0; }
  100% { transform: scale(1.28); opacity: 0; }
}

.ai-btn-icon {
  font-size: 38rpx;
  line-height: 1;
}

.ai-btn-label {
  font-size: 18rpx;
  font-weight: 700;
  color: #ffffff;
  margin-top: 2rpx;
  letter-spacing: 0.5rpx;
}

/* 顶部消息通知铃铛按钮 */
.notice-quick-btn {
  position: relative;
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  background-color: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 14rpx;
  transition: all 0.2s ease;
}

.notice-quick-btn:active {
  transform: scale(0.92);
  background-color: #e2e8f0;
}

.bell-svg {
  width: 38rpx;
  height: 38rpx;
  fill: #475569;
}

.bell-badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  padding: 0 6rpx;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 700;
  border-radius: 14rpx;
  text-align: center;
  border: 2rpx solid #ffffff;
  box-shadow: 0 2rpx 8rpx rgba(239, 68, 68, 0.4);
}
</style>
