<script setup lang="ts">
import { ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import {
  getMyActivitiesApi,
  getMyWaitlistApi,
  cancelSignupActivityApi,
  type MyActivityItem,
  type MyWaitlistItem
} from '@/api/activity'

const currentTab = ref<number | 'WAITLIST' | undefined>(undefined) // undefined=全部 1=已报名 'WAITLIST'=候补中 2=已完成 3=已失效
const loading = ref(false)
const recordList = ref<MyActivityItem[]>([])
const waitlistList = ref<MyWaitlistItem[]>([]) // 候补中独立列表
const waitlistError = ref('') // 候补接口未就绪提示

const fetchRecords = async () => {
  loading.value = true
  waitlistError.value = ''
  try {
    if (currentTab.value === 'WAITLIST') {
      // 候补中：调用专用候补接口
      try {
        const res = await getMyWaitlistApi({ page: 1, size: 50 })
        waitlistList.value = res?.records || []
      } catch (err: any) {
        // 候补接口可能尚未就绪（后端正在开发中）
        waitlistList.value = []
        if (err?.statusCode === 404 || err?.message?.includes('404')) {
          waitlistError.value = '候补功能后端接口升级中，请稍后再试'
        } else {
          waitlistError.value = err?.message || '获取候补记录失败'
        }
      }
    } else {
      const statusVal = typeof currentTab.value === 'number' ? currentTab.value : undefined
      const res = await getMyActivitiesApi({
        status: statusVal,
        page: 1,
        size: 50
      })
      recordList.value = res.records || []
    }
  } catch (err: any) {
    uni.showToast({ title: err?.message || '获取记录失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleTabChange = (val: number | 'WAITLIST' | undefined) => {
  currentTab.value = val
  fetchRecords()
}

const handleCancelSignup = (actId: number, title: string, isWaitlist = false) => {
  uni.showModal({
    title: isWaitlist ? '确认退出候补' : '确认取消报名',
    content: isWaitlist
      ? `确定退出「${title}」的候补排队吗？退出后若重新候补需重新按顺序排队。`
      : `确定取消「${title}」的报名吗？取消后名额将自动让渡给排队候补的同学。`,
    confirmText: isWaitlist ? '退出候补' : '确认取消',
    confirmColor: '#f56c6c',
    cancelText: isWaitlist ? '再想想' : '保留名额',
    success: async (res) => {
      if (!res.confirm) return
      uni.showLoading({ title: '正在取消...', mask: true })
      try {
        await cancelSignupActivityApi(actId)
        uni.hideLoading()
        uni.showToast({ title: isWaitlist ? '已退出候补' : '已取消报名', icon: 'success' })
        fetchRecords()
      } catch (err: any) {
        uni.hideLoading()
        uni.showToast({ title: err?.message || '取消失败', icon: 'none' })
      }
    }
  })
}

const goToCheckin = (actId: number) => {
  uni.navigateTo({
    url: `/pages/activity/checkin?actId=${actId}`
  })
}

const goToDetail = (actId: number) => {
  uni.navigateTo({
    url: `/pages/activity/detail?id=${actId}`
  })
}

const viewCert = (title: string, certTitle?: string) => {
  uni.showModal({
    title: '荣誉电子证书',
    content: `活动「${title}」出勤合格，已获得证书：\n${certTitle || '校园综合实践结业证书'}\n证书编号：CERT-2026-ONLINE`,
    showCancel: false,
    confirmText: '我知道了'
  })
}

onPullDownRefresh(() => {
  fetchRecords()
})

onShow(() => {
  fetchRecords()
})
</script>

<template>
  <view class="records-page">
    <!-- 顶部状态分段器 -->
    <view class="tab-segments">
      <view
        class="tab-item"
        :class="{ active: currentTab === undefined }"
        @click="handleTabChange(undefined)"
      >
        全部
      </view>
      <view
        class="tab-item"
        :class="{ active: currentTab === 1 }"
        @click="handleTabChange(1)"
      >
        已报名
      </view>
      <view
        class="tab-item"
        :class="{ active: currentTab === 'WAITLIST' }"
        @click="handleTabChange('WAITLIST')"
      >
        候补中
      </view>
      <view
        class="tab-item"
        :class="{ active: currentTab === 2 }"
        @click="handleTabChange(2)"
      >
        已完成
      </view>
      <view
        class="tab-item"
        :class="{ active: currentTab === 3 }"
        @click="handleTabChange(3)"
      >
        已失效
      </view>
    </view>

    <!-- 候补中 Tab 内容 -->
    <view v-if="currentTab === 'WAITLIST'" class="records-list">
      <!-- 候补接口未就绪提示 -->
      <view v-if="waitlistError" class="waitlist-api-notice">
        <svg class="notice-svg" viewBox="0 0 24 24"><path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>
        <view class="notice-body">
          <view class="notice-title">候补服务升级中</view>
          <view class="notice-desc">{{ waitlistError }}</view>
          <view class="notice-hint">如需查看候补状态，请前往对应活动详情页</view>
        </view>
      </view>

      <!-- 候补记录卡片 -->
      <view
        v-for="rec in waitlistList"
        :key="rec.id"
        class="record-card"
        @click="goToDetail(rec.activityId)"
      >
        <view class="record-header">
          <view class="tag-row">
            <text class="tag-category">{{ rec.categoryName || '校园活动' }}</text>
            <text v-if="rec.certificateEnabled" class="tag-cert">证书认证</text>
          </view>
          <view class="status-pill status-4">候补第{{ rec.queueNumber }}位</view>
        </view>

        <view class="record-body">
          <image v-if="rec.coverImage" class="cover-thumb" :src="rec.coverImage" mode="aspectFill" />
          <view class="record-content">
            <view class="record-title">{{ rec.title }}</view>
            <view class="record-row">
              <svg class="row-svg" viewBox="0 0 24 24"><path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/></svg>
              <text class="row-text">{{ rec.startTime }} 至 {{ rec.endTime }}</text>
            </view>
            <view class="record-row">
              <svg class="row-svg" viewBox="0 0 24 24"><path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/></svg>
              <text class="row-text">{{ rec.locationName }}</text>
            </view>
          </view>
        </view>

        <!-- 候补状态提示条 -->
        <view class="waitlist-status-bar">
          <svg class="ws-icon" viewBox="0 0 24 24"><path d="M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z"/></svg>
          <text class="ws-text">候补中，排第 {{ rec.queueNumber }} 位，等待递补通知</text>
        </view>

        <!-- 底部快捷操作 -->
        <view class="record-actions" @click.stop>
          <view class="action-left">
            <text class="points-badge">+{{ rec.points }} pts</text>
          </view>
          <view class="action-right">
            <button
              class="act-btn btn-warning-outline"
              @click="handleCancelSignup(rec.activityId, rec.title, true)"
            >
              退出候补
            </button>
          </view>
        </view>
      </view>

      <!-- 候补空状态 -->
      <view v-if="!loading && waitlistList.length === 0 && !waitlistError" class="empty-state">
        <svg class="empty-svg" viewBox="0 0 24 24"><path d="M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z"/></svg>
        <text class="empty-title">暂无候补记录</text>
        <text class="empty-sub">当活动名额已满时，可在活动详情页申请候补排队</text>
      </view>
    </view>

    <!-- 其他 Tab 内容（已报名/已完成/已失效/全部） -->
    <view v-else class="records-list">
      <view
        v-for="rec in recordList"
        :key="rec.id"
        class="record-card"
        @click="goToDetail(rec.activityId)"
      >
        <view class="record-header">
          <view class="tag-row">
            <text class="tag-category">{{ rec.categoryName || '校园活动' }}</text>
            <text v-if="rec.certificateEnabled" class="tag-cert">证书认证</text>
          </view>
          <view class="status-pill" :class="`status-${rec.status}`">
            <template v-if="rec.status === 1">已正式报名</template>
            <template v-else-if="rec.status === 2">已完成出勤</template>
            <template v-else>已取消/失效</template>
          </view>
        </view>

        <view class="record-body">
          <image
            v-if="rec.coverImage"
            class="cover-thumb"
            :src="rec.coverImage"
            mode="aspectFill"
          />
          <view class="record-content">
            <view class="record-title">{{ rec.title }}</view>

            <view class="record-row">
              <svg class="row-svg" viewBox="0 0 24 24">
                <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
              </svg>
              <text class="row-text">{{ rec.startTime }} 至 {{ rec.endTime }}</text>
            </view>
            <view class="record-row">
              <svg class="row-svg" viewBox="0 0 24 24">
                <path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/>
              </svg>
              <text class="row-text">{{ rec.locationName }}</text>
            </view>
          </view>
        </view>

        <!-- 打卡时间与获得积分 -->
        <view v-if="rec.status === 2 && rec.checkinTime" class="checkin-stamp-row">
          <text class="stamp-text">打卡时间：{{ rec.checkinTime }}</text>
          <text class="stamp-pts">已入账 +{{ rec.pointsAwarded || rec.points }} pts</text>
        </view>

        <!-- 底部快捷操作条 -->
        <view class="record-actions" @click.stop>
          <view class="action-left">
            <text class="points-badge">+{{ rec.points }} pts</text>
          </view>

          <view class="action-right">
            <!-- 已报名状态 -->
            <template v-if="rec.status === 1">
              <button
                class="act-btn btn-danger-outline"
                @click="handleCancelSignup(rec.activityId, rec.title)"
              >
                取消报名
              </button>
              <button
                class="act-btn btn-primary"
                @click="goToCheckin(rec.activityId)"
              >
                扫码打卡
              </button>
            </template>

            <!-- 已完成状态 -->
            <template v-else-if="rec.status === 2 && rec.certificateEnabled">
              <button
                class="act-btn btn-success-outline"
                @click="viewCert(rec.title, rec.certificateTitle)"
              >
                查看荣誉证书
              </button>
            </template>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && recordList.length === 0" class="empty-state">
        <svg class="empty-svg" viewBox="0 0 24 24">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
        </svg>
        <text class="empty-title">暂无该分类的活动记录</text>
        <text class="empty-sub">可前往活动广场选择感兴趣的讲座或志愿项目报名参加！</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.records-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

/* 顶部分段标签 */
.tab-segments {
  display: flex;
  background-color: #ffffff;
  border-bottom: 1px solid #ebeef5;
  padding: 0 16rpx;
  position: sticky;
  top: 0;
  z-index: 20;
}

.tab-item {
  flex: 1;
  text-align: center;
  height: 84rpx;
  line-height: 84rpx;
  font-size: 26rpx;
  color: #606266;
  position: relative;
  transition: all 0.2s;
}

.tab-item.active {
  color: #409eff;
  font-weight: 700;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 24%;
  right: 24%;
  height: 4rpx;
  background-color: #409eff;
  border-radius: 2rpx;
}

/* 记录列表 */
.records-list {
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.record-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 1px solid #ebeef5;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease;
}

.record-card:active {
  transform: scale(0.99);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}

.tag-row {
  display: flex;
  gap: 10rpx;
}

.tag-category {
  background-color: #ecf5ff;
  color: #409eff;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #d9ecff;
}

.tag-cert {
  background-color: #fdf6ec;
  color: #e6a23c;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #faecd8;
}

.status-pill {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-weight: 500;
}

.status-1 {
  background-color: #ecf5ff;
  color: #409eff;
  border: 1px solid #d9ecff;
}

.status-2 {
  background-color: #f0f9eb;
  color: #67c23a;
  border: 1px solid #c2e7b0;
}

.status-3 {
  background-color: #f4f4f5;
  color: #909399;
  border: 1px solid #e9e9eb;
}

.status-4 {
  background-color: #fdf6ec;
  color: #e6a23c;
  border: 1px solid #faecd8;
}

.record-body {
  display: flex;
  gap: 18rpx;
  align-items: flex-start;
  margin-bottom: 10rpx;
}

.cover-thumb {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background-color: #f2f3f5;
  flex-shrink: 0;
}

.record-content {
  flex: 1;
  min-width: 0;
}

.record-title {
  font-size: 29rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 14rpx;
  line-height: 1.4;
}

.record-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
  color: #606266;
  margin-bottom: 8rpx;
}

.row-svg {
  width: 26rpx;
  height: 26rpx;
  fill: #909399;
  flex-shrink: 0;
}

.row-text {
  flex: 1;
}

.checkin-stamp-row {
  display: flex;
  justify-content: space-between;
  background-color: #f0f9eb;
  border: 1px solid #e1f3d8;
  border-radius: 8rpx;
  padding: 10rpx 16rpx;
  margin: 14rpx 0;
  font-size: 22rpx;
}

.stamp-text {
  color: #529b2e;
}

.stamp-pts {
  font-weight: 700;
  color: #67c23a;
}

.record-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid #f2f3f5;
}

.points-badge {
  font-size: 28rpx;
  font-weight: 700;
  color: #e6a23c;
}

.action-right {
  display: flex;
  gap: 12rpx;
}

.act-btn {
  height: 58rpx;
  line-height: 58rpx;
  font-size: 22rpx;
  padding: 0 24rpx;
  border-radius: 29rpx;
  border: none;
  font-weight: 500;
  transition: all 0.15s ease;
}

.act-btn:active {
  transform: scale(0.97);
}

.btn-primary {
  background-color: #409eff;
  color: #ffffff;
}

.btn-danger-outline {
  background-color: #ffffff;
  border: 1px solid #fbc4c4;
  color: #f56c6c;
}

.btn-warning-outline {
  background-color: #ffffff;
  border: 1px solid #faecd8;
  color: #e6a23c;
}

.btn-success-outline {
  background-color: #f0f9eb;
  border: 1px solid #c2e7b0;
  color: #67c23a;
}

/* 空状态 */
.empty-state {
  padding: 100rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14rpx;
}

.empty-svg {
  width: 76rpx;
  height: 76rpx;
  fill: #c0c4cc;
}

.empty-title {
  font-size: 28rpx;
  color: #606266;
  font-weight: 600;
}

.empty-sub {
  font-size: 24rpx;
  color: #909399;
}

/* 候补状态提示条 */
.waitlist-status-bar {
  display: flex;
  align-items: center;
  gap: 10rpx;
  background-color: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 8rpx;
  padding: 10rpx 16rpx;
  margin: 10rpx 0 14rpx;
}

.ws-icon {
  width: 28rpx;
  height: 28rpx;
  fill: #e6a23c;
  flex-shrink: 0;
}

.ws-text {
  font-size: 22rpx;
  color: #e6a23c;
  font-weight: 500;
  flex: 1;
}

/* 候补接口升级中提示框 */
.waitlist-api-notice {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  background-color: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 12rpx;
  padding: 24rpx;
  margin: 20rpx 0;
}

.notice-svg {
  width: 44rpx;
  height: 44rpx;
  fill: #e6a23c;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.notice-body {
  flex: 1;
}

.notice-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #e6a23c;
  margin-bottom: 8rpx;
}

.notice-desc {
  font-size: 24rpx;
  color: #b87333;
  margin-bottom: 8rpx;
}

.notice-hint {
  font-size: 22rpx;
  color: #909399;
}
</style>
