<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { getActivityPageApi, type ActivityItem } from '@/api/activity'

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

// 页面视图切换：活动大厅 vs 我的参与
const activeHallTab = ref<'HALL' | 'MY'>('HALL')

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
  if (act.myEnrollmentStatus === 'ENROLLED') {
    return { text: '已报名', type: 'primary' }
  }
  if (act.myEnrollmentStatus === 'WAITLIST') {
    return { text: `候补中第${act.myQueueNumber || 1}位`, type: 'warning' }
  }
  if (act.myEnrollmentStatus === 'COMPLETED') {
    return { text: '已打卡', type: 'success' }
  }
  if (act.enrolledCount >= act.registrationLimit) {
    if (act.waitlistEnabled) {
      return { text: '可候补', type: 'warning' }
    }
    return { text: '已满额', type: 'info' }
  }
  return { text: '报名中', type: 'success' }
}

const goToDetail = (id: number) => {
  uni.navigateTo({
    url: `/pages/activity/detail?id=${id}`
  })
}

const goToCheckin = () => {
  uni.navigateTo({
    url: '/pages/activity/checkin'
  })
}

const goToMyRecords = () => {
  uni.navigateTo({
    url: '/pages/activity/records'
  })
}

onPullDownRefresh(() => {
  fetchActivities()
})

onShow(() => {
  fetchActivities()
})

onMounted(() => {
  fetchActivities()
})
</script>

<template>
  <view class="hall-container">
    <!-- 顶部综合操作区：搜索 + 扫码打卡入口 -->
    <view class="search-top-bar">
      <view class="search-input-box">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          type="text"
          :value="searchKeyword"
          placeholder="搜索学术讲座、志愿公益、体育竞赛..."
          @input="handleSearchInput"
        />
        <text v-if="searchKeyword" class="clear-btn" @click="handleClearSearch">✕</text>
      </view>

      <view class="checkin-quick-btn" @click="goToCheckin">
        <text class="qr-icon">📷</text>
        <text class="qr-text">打卡</text>
      </view>
    </view>

    <!-- 分类横滑标签 -->
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

    <!-- 大厅功能快速联动条：我的参与记录快捷入口 -->
    <view class="quick-entry-row">
      <view class="entry-sub-title">校园活动综合看板</view>
      <view class="entry-link" @click="goToMyRecords">
        <text class="link-text">我的活动记录</text>
        <text class="link-arrow">></text>
      </view>
    </view>

    <!-- 焦点推荐活动 Banner -->
    <view
      v-if="featuredActivity && !searchKeyword && currentCategory === 'ALL'"
      class="featured-banner"
      @click="goToDetail(featuredActivity.id)"
    >
      <view class="banner-top">
        <text class="banner-badge">
          {{ featuredActivity.certificateEnabled ? '重点讲座 · 颁发结业证书' : '热门活动推荐' }}
        </text>
        <text class="banner-points">+{{ featuredActivity.points }} pts</text>
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
            <text v-if="act.certificateEnabled" class="tag-badge tag-warning">颁发证书</text>
          </view>
          <text class="status-badge" :class="`status-${getStatusBadge(act).type}`">
            {{ getStatusBadge(act).text }}
          </text>
        </view>

        <!-- 标题 -->
        <view class="act-card-title">{{ act.title }}</view>

        <!-- 时间与地点 -->
        <view class="act-card-row">
          <text class="row-icon">🕒</text>
          <text class="row-text">{{ act.startTime.slice(5, 16) }} 至 {{ act.endTime.slice(11, 16) }}</text>
        </view>
        <view class="act-card-row">
          <text class="row-icon">📍</text>
          <text class="row-text">{{ act.locationName }}</text>
        </view>

        <!-- 报名进度条 -->
        <view class="act-progress-track">
          <view
            class="act-progress-fill"
            :class="{ full: act.enrolledCount >= act.registrationLimit }"
            :style="{ width: `${getPercent(act.enrolledCount, act.registrationLimit)}%` }"
          />
        </view>

        <!-- 底部说明与学分 -->
        <view class="act-bottom-info">
          <text class="enrolled-quota">
            名额 {{ act.enrolledCount }} / {{ act.registrationLimit }} 人
            <text v-if="act.waitlistCount && act.waitlistCount > 0" class="waitlist-hint">
              ({{ act.waitlistCount }}人候补中)
            </text>
          </text>
          <text class="points-val">+{{ act.points }} pts</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && activityList.length === 0" class="empty-box">
        <text class="empty-icon">📂</text>
        <text class="empty-text">暂无符合条件的校园活动</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.hall-container {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

/* 顶部搜索与扫码打卡入口 */
.search-top-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  background-color: #ffffff;
}

.search-input-box {
  flex: 1;
  display: flex;
  align-items: center;
  background-color: #f0f2f5;
  border-radius: 36rpx;
  padding: 0 20rpx;
  height: 72rpx;
}

.search-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
  color: #909399;
}

.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #303133;
}

.clear-btn {
  font-size: 26rpx;
  color: #909399;
  padding: 8rpx;
}

.checkin-quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background-color: #ecf5ff;
  border: 1px solid #b3d8ff;
  color: #409eff;
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 36rpx;
  cursor: pointer;
}

.qr-icon {
  font-size: 30rpx;
}

.qr-text {
  font-size: 26rpx;
  font-weight: 600;
}

/* 5 大分类横滑标签 */
.category-scroll-bar {
  background-color: #ffffff;
  border-bottom: 1px solid #ebeef5;
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
  color: #606266;
  background-color: #f4f4f5;
  border: 1px solid #e9e9eb;
  flex-shrink: 0;
}

.cat-pill.active {
  background-color: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

/* 快速入口条 */
.quick-entry-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx 8rpx;
}

.entry-sub-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #909399;
}

.entry-link {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
  color: #409eff;
}

.link-arrow {
  font-size: 24rpx;
}

/* 焦点活动推荐 Banner (旗舰深蓝) */
.featured-banner {
  margin: 12rpx 24rpx;
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  border-radius: 16rpx;
  padding: 24rpx;
  color: #ffffff;
  box-shadow: 0 4rpx 16rpx rgba(30, 58, 138, 0.25);
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
  border-radius: 8rpx;
  font-size: 22rpx;
}

.banner-points {
  font-size: 28rpx;
  font-weight: 700;
  color: #fcd34d;
}

.banner-title {
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.banner-desc {
  font-size: 22rpx;
  color: #cbd5e1;
}

/* 活动卡片列表 */
.activity-list-wrap {
  padding: 12rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.act-item-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 1px solid #ebeef5;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
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
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
}

.tag-primary {
  background-color: #ecf5ff;
  color: #409eff;
}

.tag-warning {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.status-badge {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-weight: 500;
}

.status-success {
  background-color: #f0f9eb;
  color: #67c23a;
  border: 1px solid #c2e7b0;
}

.status-warning {
  background-color: #fdf6ec;
  color: #e6a23c;
  border: 1px solid #f5dab1;
}

.status-info {
  background-color: #f4f4f5;
  color: #909399;
  border: 1px solid #e9e9eb;
}

.status-primary {
  background-color: #ecf5ff;
  color: #409eff;
  border: 1px solid #d9ecff;
}

.act-card-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #303133;
  line-height: 1.4;
  margin-bottom: 14rpx;
}

.act-card-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 24rpx;
  color: #606266;
  margin-bottom: 8rpx;
}

.row-icon {
  font-size: 24rpx;
}

.row-text {
  flex: 1;
}

.act-progress-track {
  height: 8rpx;
  background-color: #f2f3f5;
  border-radius: 4rpx;
  overflow: hidden;
  margin: 18rpx 0 12rpx;
}

.act-progress-fill {
  height: 100%;
  background-color: #409eff;
  border-radius: 4rpx;
  transition: width 0.3s ease;
}

.act-progress-fill.full {
  background-color: #e6a23c;
}

.act-bottom-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24rpx;
}

.enrolled-quota {
  color: #909399;
}

.waitlist-hint {
  color: #e6a23c;
  margin-left: 6rpx;
}

.points-val {
  color: #e6a23c;
  font-weight: 700;
  font-size: 28rpx;
}

/* 空状态 */
.empty-box {
  padding: 80rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.empty-icon {
  font-size: 64rpx;
}

.empty-text {
  font-size: 26rpx;
  color: #909399;
}
</style>
