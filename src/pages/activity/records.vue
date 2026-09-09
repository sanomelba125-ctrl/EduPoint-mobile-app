<script setup lang="ts">
import { ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import {
  getMyActivitiesApi,
  cancelSignupActivityApi,
  type MyActivityItem
} from '@/api/activity'

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
    uni.showToast({ title: err.message || '获取记录失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleTabChange = (val?: number) => {
  currentTab.value = val
  fetchRecords()
}

const handleCancelSignup = (actId: number, title: string) => {
  uni.showModal({
    title: '确认取消报名',
    content: `确定取消「${title}」的报名吗？取消后名额将自动让渡给排队候补的同学。`,
    confirmText: '确认取消',
    confirmColor: '#f56c6c',
    cancelText: '保留名额',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await cancelSignupActivityApi(actId)
        uni.showToast({ title: '已取消报名', icon: 'success' })
        fetchRecords()
      } catch (err: any) {
        uni.showToast({ title: err.message || '取消失败', icon: 'none' })
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
            <template v-else-if="rec.status === 4">候补排队第{{ rec.queueNumber || 1 }}位</template>
            <template v-else>已取消/失效</template>
          </view>
        </view>

        <view class="record-title">{{ rec.title }}</view>

        <view class="record-row">
          <text class="row-icon">🕒</text>
          <text class="row-text">{{ rec.startTime }} 至 {{ rec.endTime }}</text>
        </view>
        <view class="record-row">
          <text class="row-icon">📍</text>
          <text class="row-text">{{ rec.locationName }}</text>
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

            <!-- 候补中状态 -->
            <template v-else-if="rec.status === 4">
              <button
                class="act-btn btn-warning-outline"
                @click="handleCancelSignup(rec.activityId, rec.title)"
              >
                退出候补
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
        <text class="empty-icon">📝</text>
        <text class="empty-title">暂无该分类的活动记录</text>
        <text class="empty-sub">可前往活动大厅选择感兴趣的讲座或志愿项目报名！</text>
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
}

.tab-item {
  flex: 1;
  text-align: center;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 26rpx;
  color: #606266;
  position: relative;
}

.tab-item.active {
  color: #409eff;
  font-weight: 700;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
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
  border-radius: 6rpx;
}

.tag-cert {
  background-color: #fdf6ec;
  color: #e6a23c;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
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

.record-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.record-row {
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

.checkin-stamp-row {
  display: flex;
  justify-content: space-between;
  background-color: #f0f9eb;
  border-radius: 8rpx;
  padding: 10rpx 16rpx;
  margin: 12rpx 0;
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
  height: 56rpx;
  line-height: 56rpx;
  font-size: 22rpx;
  padding: 0 20rpx;
  border-radius: 28rpx;
  border: none;
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
  gap: 12rpx;
}

.empty-icon {
  font-size: 72rpx;
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
</style>
