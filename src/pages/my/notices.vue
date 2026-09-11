<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import {
  getMyNoticesApi,
  getUnreadNoticeCountApi,
  markNoticeAsReadApi,
  markAllNoticesAsReadApi,
  deleteNoticeApi,
  type SysNoticeVO
} from '@/api/notice'

// 当前筛选状态: 'all' | 'unread' | 'read'
const activeTab = ref<'all' | 'unread' | 'read'>('all')
const noticeList = ref<SysNoticeVO[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 15
const hasMore = ref(true)

// 获取未读通知数量
const fetchUnreadCount = async () => {
  try {
    const res = await getUnreadNoticeCountApi()
    unreadCount.value = res || 0
  } catch (err) {
    console.warn('获取未读通知数失败:', err)
  }
}

// 获取通知列表
const fetchNotices = async (reset = false) => {
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (!hasMore.value && !reset) return

  loading.value = true
  try {
    const isReadParam = activeTab.value === 'unread' ? 0 : activeTab.value === 'read' ? 1 : undefined
    const res = await getMyNoticesApi({
      page: page.value,
      size: pageSize,
      isRead: isReadParam
    })

    const records = res?.records || []
    if (reset) {
      noticeList.value = records
    } else {
      noticeList.value = [...noticeList.value, ...records]
    }

    if (records.length < pageSize || (res?.total && noticeList.value.length >= res.total)) {
      hasMore.value = false
    } else {
      page.value++
    }
  } catch (err) {
    uni.showToast({ title: '加载通知失败', icon: 'none' })
  } finally {
    loading.value = false
    if (refreshing.value) {
      refreshing.value = false
      uni.stopPullDownRefresh()
    }
  }
}

// 切换标签
const switchTab = (tab: 'all' | 'unread' | 'read') => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  fetchNotices(true)
}

// 单条点击标记已读
const handleNoticeClick = async (item: SysNoticeVO) => {
  if (item.isRead === 0) {
    try {
      await markNoticeAsReadApi(item.id)
      item.isRead = 1
      if (unreadCount.value > 0) unreadCount.value--
    } catch (err) {
      console.warn('标记已读失败:', err)
    }
  }

  // 点击展开弹窗阅读详情
  uni.showModal({
    title: item.title,
    content: item.content,
    showCancel: false,
    confirmText: '我知道了'
  })
}

// 全部标记已读
const handleMarkAllRead = async () => {
  if (unreadCount.value === 0) {
    uni.showToast({ title: '暂无未读通知', icon: 'none' })
    return
  }
  uni.showLoading({ title: '正在处理...' })
  try {
    await markAllNoticesAsReadApi()
    uni.hideLoading()
    uni.showToast({ title: '已全部标记为已读', icon: 'success' })
    unreadCount.value = 0
    fetchNotices(true)
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

// 删除单条通知
const handleDeleteNotice = (item: SysNoticeVO) => {
  uni.showModal({
    title: '删除提示',
    content: '确定要删除这条通知吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await deleteNoticeApi(item.id)
          uni.showToast({ title: '已删除', icon: 'none' })
          noticeList.value = noticeList.value.filter((n) => n.id !== item.id)
          if (item.isRead === 0 && unreadCount.value > 0) {
            unreadCount.value--
          }
        } catch (err) {
          uni.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    }
  })
}

// 时间格式化
const formatTime = (timeStr?: string) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  if (isNaN(date.getTime())) return timeStr
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

// 获取徽标与样式
const getNoticeBadgeClass = (type?: string) => {
  switch (type) {
    case 'points_adjusted':
      return 'badge-orange'
    case 'activity_card':
    case 'activity_checkin_reward':
      return 'badge-green'
    case 'gift_send':
      return 'badge-purple'
    case 'gift_exchange':
      return 'badge-blue'
    case 'waitlist_promoted':
      return 'badge-teal'
    default:
      return 'badge-default'
  }
}

onMounted(() => {
  fetchUnreadCount()
  fetchNotices(true)
})

onPullDownRefresh(() => {
  refreshing.value = true
  fetchUnreadCount()
  fetchNotices(true)
})

onReachBottom(() => {
  if (!loading.value && hasMore.value) {
    fetchNotices(false)
  }
})
</script>

<template>
  <view class="notices-page">
    <!-- 顶部状态与筛选栏 -->
    <view class="top-nav-bar">
      <view class="tab-pill-group">
        <view
          class="tab-pill"
          :class="{ active: activeTab === 'all' }"
          @click="switchTab('all')"
        >
          全部
        </view>
        <view
          class="tab-pill"
          :class="{ active: activeTab === 'unread' }"
          @click="switchTab('unread')"
        >
          未读
          <text v-if="unreadCount > 0" class="tab-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
        </view>
        <view
          class="tab-pill"
          :class="{ active: activeTab === 'read' }"
          @click="switchTab('read')"
        >
          已读
        </view>
      </view>

      <view class="action-btn-box" @click="handleMarkAllRead">
        <text class="action-btn-text" :class="{ disabled: unreadCount === 0 }">全部已读</text>
      </view>
    </view>

    <!-- 列表内容区 -->
    <view class="notice-list">
      <view
        v-for="item in noticeList"
        :key="item.id"
        class="notice-card"
        :class="{ unread: item.isRead === 0 }"
        @click="handleNoticeClick(item)"
      >
        <view class="card-header">
          <view class="header-left">
            <view v-if="item.isRead === 0" class="pulse-dot"></view>
            <view class="type-tag" :class="getNoticeBadgeClass(item.type)">
              {{ item.typeName || '系统通知' }}
            </view>
            <text class="notice-title">{{ item.title }}</text>
          </view>
          <text class="notice-time">{{ formatTime(item.createTime) }}</text>
        </view>

        <view class="notice-content">
          {{ item.content }}
        </view>

        <view class="card-footer">
          <text v-if="item.isRead === 0" class="status-tip unread">● 未读，轻触查看详情</text>
          <text v-else class="status-tip read">已读</text>

          <view class="delete-link" @click.stop="handleDeleteNotice(item)">
            <text class="delete-text">删除</text>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && noticeList.length === 0" class="empty-state">
        <view class="empty-icon">🔔</view>
        <text class="empty-title">暂无通知记录</text>
        <text class="empty-desc">活动提醒、奖励通知与订单动态将在此显示</text>
      </view>

      <!-- 加载中/没有更多 -->
      <view v-if="noticeList.length > 0" class="loading-footer">
        <text v-if="loading" class="loading-text">正在加载更多通知...</text>
        <text v-else-if="!hasMore" class="loading-text">已加载全部通知</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.notices-page {
  min-height: 100vh;
  background-color: #f4f6fa;
  padding-bottom: 40rpx;
}

.top-nav-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: #ffffff;
  padding: 20rpx 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}

.tab-pill-group {
  display: flex;
  background-color: #f0f2f5;
  border-radius: 40rpx;
  padding: 6rpx;
}

.tab-pill {
  position: relative;
  padding: 10rpx 28rpx;
  font-size: 26rpx;
  color: #606266;
  border-radius: 32rpx;
  transition: all 0.25s ease;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.tab-pill.active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 4rpx 10rpx rgba(37, 99, 235, 0.25);
}

.tab-badge {
  background-color: #ef4444;
  color: #ffffff;
  font-size: 20rpx;
  padding: 0 8rpx;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  border-radius: 14rpx;
  text-align: center;
  font-weight: bold;
}

.tab-pill.active .tab-badge {
  background-color: #ffffff;
  color: #ef4444;
}

.action-btn-box {
  padding: 10rpx 16rpx;
}

.action-btn-text {
  font-size: 26rpx;
  color: #2563eb;
  font-weight: 500;
}

.action-btn-text.disabled {
  color: #c0c4cc;
}

.notice-list {
  padding: 24rpx 28rpx;
}

.notice-card {
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 26rpx 28rpx;
  margin-bottom: 22rpx;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.03);
  border: 1rpx solid #eef0f4;
  transition: all 0.2s ease;
}

.notice-card.unread {
  border-left: 8rpx solid #3b82f6;
  background-color: #fbfdff;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
  overflow: hidden;
}

.pulse-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #ef4444;
  flex-shrink: 0;
}

.type-tag {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-weight: 500;
  flex-shrink: 0;
}

.badge-orange {
  background-color: #fff7ed;
  color: #ea580c;
}

.badge-green {
  background-color: #f0fdf4;
  color: #16a34a;
}

.badge-purple {
  background-color: #faf5ff;
  color: #9333ea;
}

.badge-blue {
  background-color: #eff6ff;
  color: #2563eb;
}

.badge-teal {
  background-color: #f0fdfa;
  color: #0d9488;
}

.badge-default {
  background-color: #f3f4f6;
  color: #4b5563;
}

.notice-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice-time {
  font-size: 22rpx;
  color: #9ca3af;
  flex-shrink: 0;
  margin-left: 12rpx;
}

.notice-content {
  font-size: 27rpx;
  line-height: 1.6;
  color: #4b5563;
  margin-bottom: 18rpx;
  word-break: break-all;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1rpx dashed #f3f4f6;
  padding-top: 14rpx;
  font-size: 22rpx;
}

.status-tip.unread {
  color: #2563eb;
  font-weight: 500;
}

.status-tip.read {
  color: #9ca3af;
}

.delete-link {
  padding: 6rpx 12rpx;
}

.delete-text {
  font-size: 22rpx;
  color: #f87171;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 140rpx 40rpx;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #9ca3af;
  text-align: center;
}

.loading-footer {
  text-align: center;
  padding: 30rpx 0;
}

.loading-text {
  font-size: 24rpx;
  color: #9ca3af;
}
</style>
