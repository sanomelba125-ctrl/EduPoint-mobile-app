<script setup lang="ts">
import { ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import {
  getMyActivitiesApi,
  cancelSignupActivityApi,
  type MyActivityItem
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import { resolveImageUrl } from '@/utils/image'
import { promptCancelSignupModal } from '@/utils/activityStatus'

const currentTab = ref<number | undefined>(undefined) // undefined = 全部, 1 = 已报名, 2 = 已完成, 4 = 候补中, 3 = 已失效
const loading = ref(false)
const recordList = ref<MyActivityItem[]>([])

const fetchRecords = async () => {
  loading.value = true
  try {
    const res = await getMyActivitiesApi({
      status: currentTab.value,
      page: 1,
      size: 50
    })
    recordList.value = res.records || []
  } catch (err: any) {
    uni.showToast({ title: err?.message || '获取记录失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleTabChange = (val?: number) => {
  currentTab.value = val
  fetchRecords()
}

const handleCancelSignup = (actId: number, title: string, isWaitlist: boolean) => {
  promptCancelSignupModal({
    title,
    isWaitlist,
    onConfirm: async () => {
      uni.showLoading({ title: isWaitlist ? '正在退出候补...' : '正在取消...', mask: true })
      try {
        const message = await cancelSignupActivityApi(actId)
        uni.hideLoading()
        uni.showToast({ title: message || (isWaitlist ? '已退出候补' : '已取消报名'), icon: 'success' })
        fetchRecords()
      } catch (err: any) {
        uni.hideLoading()
        uni.showToast({ title: getApiErrorMessage(err, '取消失败'), icon: 'none' })
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

const viewCert = (activityId: number) => {
  uni.navigateTo({
    url: `/pages/certificate/index?activityId=${activityId}`
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
        :class="{ active: currentTab === 4 }"
        @click="handleTabChange(4)"
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

    <!-- 记录卡片列表 -->
    <view class="records-list">
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
            <template v-else-if="rec.status === 4">{{ rec.queueNumber ? `候补排第${rec.queueNumber}位` : '候补排队中' }}</template>
            <template v-else>已取消/失效</template>
          </view>
        </view>

        <view class="record-body">
          <image
            v-if="rec.coverImage"
            class="cover-thumb"
            :src="resolveImageUrl(rec.coverImage)"
            mode="aspectFill"
          />
          <view class="record-content">
            <view class="record-title">{{ rec.title }}</view>

            <view class="record-row">
              <svg class="row-svg" viewBox="0 0 24 24">
                <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
              </svg>
              <text class="row-text">{{ rec.startTime }}{{ rec.endTime ? ` 至 ${rec.endTime}` : ' 开始' }}</text>
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
          <text class="stamp-pts">已入账 +{{ rec.pointsAwarded || rec.points }} 积分</text>
        </view>

        <!-- 底部快捷操作条 -->
        <view class="record-actions" @click.stop>
          <view class="action-left">
            <!-- 已完成/已取消的记录不再重复展示积分（打卡戳与退单说明已表达） -->
            <text v-if="rec.status === 1 || rec.status === 4" class="points-badge">完成可得 +{{ rec.points }} 积分</text>
          </view>

          <view class="action-right">
            <!-- 已报名状态 -->
            <template v-if="rec.status === 1">
              <button
                class="act-btn btn-danger-outline"
                @click="handleCancelSignup(rec.activityId, rec.title, false)"
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

            <!-- 候补中状态 -->
            <template v-else-if="rec.status === 4">
              <button
                class="act-btn btn-warning-outline"
                @click="handleCancelSignup(rec.activityId, rec.title, true)"
              >
                退出候补
              </button>
            </template>

            <!-- 已完成状态 -->
            <template v-else-if="rec.status === 2 && rec.certificateEnabled">
              <button
                class="act-btn btn-success-outline"
                @click="viewCert(rec.activityId)"
              >
                查看荣誉证书
              </button>
            </template>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <app-empty
        v-if="!loading && recordList.length === 0"
        icon="folder"
        :title="currentTab ? '该分类下暂无活动记录' : '暂无活动记录'"
        desc="去活动大厅看看正在报名的讲座与志愿项目"
      />
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
  border-bottom: 1px solid #e2e8f0;
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
  color: #475569;
  position: relative;
  transition: all 0.2s;
}

.tab-item.active {
  color: #2563eb;
  font-weight: 700;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 24%;
  right: 24%;
  height: 4rpx;
  background-color: #2563eb;
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
  border: 1px solid #e2e8f0;
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
  background-color: #eff6ff;
  color: #2563eb;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  border: 1px solid #d9ecff;
}

.tag-cert {
  background-color: #fffbeb;
  color: #f59e0b;
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
  background-color: #eff6ff;
  color: #2563eb;
  border: 1px solid #d9ecff;
}

.status-2 {
  background-color: #ecfdf5;
  color: #10b981;
  border: 1px solid #c2e7b0;
}

.status-3 {
  background-color: #f4f4f5;
  color: #64748b;
  border: 1px solid #e9e9eb;
}

.status-4 {
  background-color: #fffbeb;
  color: #f59e0b;
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
  color: #1e293b;
  margin-bottom: 14rpx;
  line-height: 1.4;
}

.record-row {
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
  flex-shrink: 0;
}

.row-text {
  flex: 1;
}

.checkin-stamp-row {
  display: flex;
  justify-content: space-between;
  background-color: #ecfdf5;
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
  color: #10b981;
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
  color: #f59e0b;
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
  background-color: #2563eb;
  color: #ffffff;
}

.btn-danger-outline {
  background-color: #ffffff;
  border: 1px solid #fbc4c4;
  color: #ef4444;
}

.btn-warning-outline {
  background-color: #ffffff;
  border: 1px solid #faecd8;
  color: #f59e0b;
}

.btn-success-outline {
  background-color: #ecfdf5;
  border: 1px solid #c2e7b0;
  color: #10b981;
}

/* 空状态 */



</style>
