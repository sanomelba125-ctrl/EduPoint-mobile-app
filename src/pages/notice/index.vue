<script setup lang="ts">
import { ref, computed } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import {
  getMyNoticesApi,
  getUnreadNoticeCountApi,
  markNoticeAsReadApi,
  markAllNoticesAsReadApi,
  deleteNoticeApi,
  type SysNoticeVO
} from '@/api/notice'

// 筛选标签类型定义
type TabType = 'all' | 'unread' | 'activity' | 'points' | 'gift'

const activeTab = ref<TabType>('all')
const noticeList = ref<SysNoticeVO[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 30
const hasMore = ref(true)

// 当前选中的详情弹窗通知
const detailNotice = ref<SysNoticeVO | null>(null)
const detailModalVisible = ref(false)

// 分类选项
const TAB_OPTIONS: { key: TabType; name: string }[] = [
  { key: 'all', name: '全部' },
  { key: 'unread', name: '未读' },
  { key: 'activity', name: '活动' },
  { key: 'points', name: '积分' },
  { key: 'gift', name: '礼品' }
]

// 获取未读通知数量
const fetchUnreadCount = async () => {
  try {
    const res = await getUnreadNoticeCountApi()
    unreadCount.value = res || 0
  } catch (err) {
    console.warn('获取未读通知数失败:', err)
  }
}

// 筛选后用于展示的通知列表
const filteredNoticeList = computed(() => {
  if (activeTab.value === 'all' || activeTab.value === 'unread') return noticeList.value
  if (activeTab.value === 'activity') {
    return noticeList.value.filter(
      (n) =>
        n.type.startsWith('activity_') ||
        n.type === 'new_activity' ||
        n.type === 'waitlist_promoted'
    )
  }
  if (activeTab.value === 'points') {
    return noticeList.value.filter((n) => n.type.includes('points'))
  }
  if (activeTab.value === 'gift') {
    return noticeList.value.filter((n) => n.type.startsWith('gift_'))
  }
  return noticeList.value
})

// 分页拉取通知列表（支持后端 isRead 筛选，切换 Tab 时重置分页）
let noticeReqSeq = 0
const fetchNotices = async (reset = false) => {
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (!hasMore.value && !reset) return

  const seq = ++noticeReqSeq
  loading.value = true
  try {
    const isReadParam = activeTab.value === 'unread' ? 0 : undefined
    const res = await getMyNoticesApi({
      page: page.value,
      size: pageSize,
      isRead: isReadParam
    })
    // 切 Tab 与翻页并发时，晚到的旧响应不得污染当前列表
    if (seq !== noticeReqSeq) return

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

// 切换标签栏（切换时重置分页向后端发起精准检索）
const switchTab = (tab: TabType) => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  fetchNotices(true)
}

// 单条通知点击查看详情并标记已读
const handleNoticeClick = async (item: SysNoticeVO) => {
  if (item.isRead === 0) {
    try {
      const ok = await markNoticeAsReadApi(item.id)
      if (ok !== false) {
        item.isRead = 1
        if (unreadCount.value > 0) unreadCount.value--
      }
    } catch (err) {
      console.warn('标记已读失败:', err)
    }
  }

  detailNotice.value = item
  detailModalVisible.value = true
}

// 全部标记已读
const handleMarkAllRead = async () => {
  if (unreadCount.value === 0) {
    uni.showToast({ title: '暂无未读通知', icon: 'none' })
    return
  }
  uni.showModal({
    title: '全部已读确认',
    content: `确定将当前所有未读通知标记为已读吗？`,
    confirmColor: '#2563eb',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '正在处理...' })
        try {
          const ok = await markAllNoticesAsReadApi()
          uni.hideLoading()
          if (ok === false) {
            uni.showToast({ title: '操作失败，请重试', icon: 'none' })
            return
          }
          uni.showToast({ title: '已全部标记为已读', icon: 'success' })
          unreadCount.value = 0
          noticeList.value.forEach((n) => {
            n.isRead = 1
          })
          // "未读"页签是服务端筛选，本地改 isRead 不会剔除条目，必须重拉
          if (activeTab.value === 'unread') {
            fetchNotices(true)
          }
        } catch (err) {
          uni.hideLoading()
          uni.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    }
  })
}

// 删除通知
const handleDeleteNotice = (item: SysNoticeVO) => {
  uni.showModal({
    title: '删除提示',
    content: '确定要删除这条通知吗？删除后将不可撤回。',
    confirmColor: '#ef4444',
    success: async (res) => {
      if (res.confirm) {
        try {
          const ok = await deleteNoticeApi(item.id)
          if (ok === false) {
            uni.showToast({ title: '删除失败，请重试', icon: 'none' })
            return
          }
          uni.showToast({ title: '已删除', icon: 'none' })
          noticeList.value = noticeList.value.filter((n) => n.id !== item.id)
          if (item.isRead === 0 && unreadCount.value > 0) {
            unreadCount.value--
          }
          if (detailNotice.value?.id === item.id) {
            detailModalVisible.value = false
          }
        } catch (err) {
          uni.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    }
  })
}

// 智能业务跳转
const handleActionJump = (item: SysNoticeVO) => {
  detailModalVisible.value = false

  // 1. 活动相关跳转 (new_activity, activity_card, waitlist_promoted)
  if (
    item.type.startsWith('activity_') ||
    item.type === 'new_activity' ||
    item.type === 'waitlist_promoted'
  ) {
    if (item.bizId) {
      uni.navigateTo({
        url: `/pages/activity/detail?id=${item.bizId}`
      })
    } else {
      uni.switchTab({
        url: '/pages/activity/index'
      })
    }
    return
  }

  // 2. 礼品兑换相关跳转
  if (item.type.startsWith('gift_')) {
    uni.navigateTo({
      url: '/pages/my/orders'
    })
    return
  }

  // 3. 积分变动相关跳转
  if (item.type.includes('points')) {
    uni.navigateTo({
      url: '/pages/my/points'
    })
    return
  }
}

// 业务跳转按钮文字解析
const getActionBtnText = (item: SysNoticeVO): string => {
  if (
    item.type.startsWith('activity_') ||
    item.type === 'new_activity' ||
    item.type === 'waitlist_promoted'
  ) {
    return '前往查看活动'
  }
  if (item.type.startsWith('gift_')) {
    return '查看提货核销码'
  }
  if (item.type.includes('points')) {
    return '查看积分账单'
  }
  return ''
}

// 通知类型徽章样式与图标配置
const getTypeConfig = (type?: string) => {
  switch (type) {
    case 'points_adjusted':
      return { label: '积分调账', badgeClass: 'badge-orange', icon: 'coins' }
    case 'activity_checkin_reward':
      return { label: '打卡奖励', badgeClass: 'badge-green', icon: 'target' }
    case 'activity_card':
      return { label: '活动出勤', badgeClass: 'badge-green', icon: 'map-pin' }
    case 'new_activity':
      return { label: '新活动发布', badgeClass: 'badge-blue', icon: 'megaphone' }
    case 'waitlist_promoted':
      return { label: '候补转正', badgeClass: 'badge-teal', icon: 'zap' }
    case 'gift_exchange':
      return { label: '礼品兑换', badgeClass: 'badge-purple', icon: 'gift' }
    case 'gift_send':
      return { label: '提货就绪', badgeClass: 'badge-purple', icon: 'package' }
    default:
      return { label: '系统通知', badgeClass: 'badge-default', icon: 'bell' }
  }
}

// 友好时间格式化
const formatTime = (timeStr?: string) => {
  if (!timeStr) return ''
  // 后端统一序列化为 "yyyy-MM-dd HH:mm:ss"（空格分隔），iOS/小程序引擎解析非 ISO 串会得到 Invalid Date
  const date = new Date(timeStr.replace(' ', 'T'))
  if (isNaN(date.getTime())) return timeStr

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `今天 ${hours}:${minutes}`
  }

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

onShow(() => {
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
  <view class="notice-center-page">
    <!-- 顶部状态栏与分类横滑栏 (吸顶) -->
    <view class="top-nav-bar">
      <!-- 横滑分类标签（外层加右侧渐隐，提示可横向滑动） -->
      <view class="tab-scroll-outer">
        <scroll-view class="tab-scroll-wrap" scroll-x :show-scrollbar="false">
          <view class="tab-pill-group">
            <view
              v-for="tab in TAB_OPTIONS"
              :key="tab.key"
              class="tab-pill"
              :class="{ active: activeTab === tab.key }"
              @click="switchTab(tab.key)"
            >
              <text class="tab-text">{{ tab.name }}</text>
              <text
                v-if="tab.key === 'unread' && unreadCount > 0"
                class="tab-badge"
              >
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 右侧操作栏：全部已读（无未读时点击会得到提示，故不置灰） -->
      <view class="action-bar-right" @click="handleMarkAllRead">
        <text class="action-btn-text">
          全部已读
        </text>
      </view>
    </view>

    <!-- 消息列表主体内容 -->
    <view class="notice-list-container">
      <view
        v-for="item in filteredNoticeList"
        :key="item.id"
        class="notice-card"
        :class="{ unread: item.isRead === 0 }"
        @click="handleNoticeClick(item)"
      >
        <view class="card-header">
          <view class="header-left">
            <view v-if="item.isRead === 0" class="pulse-dot"></view>
            <view class="type-tag" :class="getTypeConfig(item.type).badgeClass">
              <view class="type-icon"><app-icon :name="getTypeConfig(item.type).icon" :size="30" /></view>
              <text class="type-name">{{ item.typeName || getTypeConfig(item.type).label }}</text>
            </view>
            <text class="notice-title">{{ item.title }}</text>
          </view>
          <text class="notice-time">{{ formatTime(item.createTime) }}</text>
        </view>

        <view class="notice-body">
          {{ item.content }}
        </view>

        <view class="card-footer">
          <view class="footer-status">
            <text v-if="item.isRead === 0" class="status-tip unread">● 未读通知</text>
            <text v-else class="status-tip read">已读</text>
          </view>

          <view class="footer-actions">
            <!-- 业务直达按钮 -->
            <view
              v-if="getActionBtnText(item)"
              class="action-link-btn"
              @click.stop="handleActionJump(item)"
            >
              <text class="action-link-text">{{ getActionBtnText(item) }}</text>
              <text class="action-link-arrow">&gt;</text>
            </view>

            <!-- 删除按钮 -->
            <view class="delete-btn" @click.stop="handleDeleteNotice(item)">
              <text class="delete-text">删除</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <app-empty
        v-if="!loading && filteredNoticeList.length === 0"
        icon="bell"
        :title="activeTab === 'unread' ? '暂无未读通知' : '暂无相关系统通知'"
        desc="活动报名、现场打卡、积分变动与礼品提货动态将第一时间在此送达"
      />

      <!-- 底部分页加载提示 -->
      <view v-if="filteredNoticeList.length > 0" class="loading-footer">
        <text v-if="loading" class="loading-text">正在加载更多通知...</text>
        <text v-else-if="!hasMore" class="loading-text">已加载全部通知</text>
      </view>
    </view>

    <!-- 消息详情与联动弹窗 -->
    <view v-if="detailModalVisible && detailNotice" class="modal-mask" @click="detailModalVisible = false">
      <view class="modal-card" @click.stop>
        <view class="modal-header">
          <view class="modal-title-box">
            <text class="modal-type-tag" :class="getTypeConfig(detailNotice.type).badgeClass">
              {{ detailNotice.typeName || getTypeConfig(detailNotice.type).label }}
            </text>
            <text class="modal-title">{{ detailNotice.title }}</text>
          </view>
          <view class="modal-close" @click="detailModalVisible = false">✕</view>
        </view>

        <view class="modal-time-bar">
          <text class="modal-time">{{ detailNotice.createTime?.replace('T', ' ').substring(0, 19) }}</text>
        </view>

        <view class="modal-content">
          {{ detailNotice.content }}
        </view>

        <view class="modal-footer">
          <button
            v-if="getActionBtnText(detailNotice)"
            class="modal-btn-primary"
            @click="handleActionJump(detailNotice)"
          >
            {{ getActionBtnText(detailNotice) }}
          </button>
          <button class="modal-btn-default" @click="detailModalVisible = false">
            关闭
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.notice-center-page {
  min-height: 100vh;
  background-color: #f4f6fa;
  padding-bottom: 50rpx;
}

/* 顶部吸顶导航栏 */
.top-nav-bar {
  position: sticky;
  top: 0;
  z-index: 60;
  background-color: #ffffff;
  padding: 16rpx 28rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}

.tab-scroll-outer {
  position: relative;
  flex: 1;
  min-width: 0;
  margin-right: 20rpx;
}
.tab-scroll-outer::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 48rpx;
  background: linear-gradient(to right, rgba(255, 255, 255, 0), #ffffff);
  pointer-events: none;
}
.tab-scroll-wrap {
  white-space: nowrap;
}

.tab-pill-group {
  display: inline-flex;
  background-color: #f0f2f5;
  border-radius: 40rpx;
  padding: 6rpx;
  gap: 4rpx;
}

.tab-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 26rpx;
  border-radius: 32rpx;
  font-size: 26rpx;
  color: #64748b;
  transition: all 0.25s ease;
}

.tab-pill.active {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(37, 99, 235, 0.25);
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

.action-bar-right {
  flex-shrink: 0;
  padding: 8rpx 12rpx;
}

.action-btn-text {
  font-size: 26rpx;
  color: #2563eb;
  font-weight: 600;
}

/* 消息列表主体 */
.notice-list-container {
  padding: 24rpx 28rpx;
}

.notice-card {
  position: relative;
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 26rpx 28rpx;
  margin-bottom: 22rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
  transition: all 0.25s ease;
}

.notice-card:active {
  transform: scale(0.99);
}

.notice-card.unread {
  border-left: 8rpx solid #3b82f6;
  background-color: #ffffff;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
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
  background-color: #3b82f6;
  flex-shrink: 0;
  box-shadow: 0 0 8rpx rgba(59, 130, 246, 0.7);
  animation: pulseDot 1.8s infinite;
}

@keyframes pulseDot {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.type-icon {
  font-size: 22rpx;
  line-height: 1;
}

.type-name {
  line-height: 1;
}

.badge-blue {
  background-color: #eff6ff;
  color: #2563eb;
}

.badge-green {
  background-color: #ecfdf5;
  color: #059669;
}

.badge-orange {
  background-color: #fffbeb;
  color: #d97706;
}

.badge-purple {
  background-color: #f5f3ff;
  color: #7c3aed;
}

.badge-teal {
  background-color: #f0fdfa;
  color: #0d9488;
}

.badge-default {
  background-color: #f1f5f9;
  color: #64748b;
}

.notice-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-time {
  font-size: 22rpx;
  color: #94a3b8;
  flex-shrink: 0;
  margin-left: 12rpx;
}

.notice-body {
  font-size: 26rpx;
  color: #475569;
  line-height: 1.55;
  margin-bottom: 18rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f8fafc;
  padding-top: 14rpx;
}

.footer-status {
  display: flex;
  align-items: center;
}

.status-tip {
  font-size: 22rpx;
}

.status-tip.unread {
  color: #3b82f6;
  font-weight: 600;
}

.status-tip.read {
  color: #94a3b8;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.action-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 16rpx;
  background-color: #eff6ff;
  border-radius: 20rpx;
}

.action-link-text {
  font-size: 22rpx;
  color: #2563eb;
  font-weight: 600;
}

.action-link-arrow {
  font-size: 22rpx;
  color: #2563eb;
}

.delete-btn {
  padding: 6rpx 10rpx;
}

.delete-text {
  font-size: 22rpx;
  color: #94a3b8;
}

.delete-text:active {
  color: #ef4444;
}

/* 空状态 */




.loading-footer {
  text-align: center;
  padding: 30rpx 0;
}

.loading-text {
  font-size: 24rpx;
  color: #94a3b8;
}

/* 详情弹窗 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background-color: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  backdrop-filter: blur(4px);
}

.modal-card {
  width: 100%;
  max-width: 620rpx;
  background-color: #ffffff;
  border-radius: 28rpx;
  padding: 36rpx;
  box-shadow: 0 20rpx 50rpx rgba(0, 0, 0, 0.2);
  animation: modalPop 0.25s ease-out;
}

@keyframes modalPop {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.modal-title-box {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex: 1;
}

.modal-type-tag {
  align-self: flex-start;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-size: 20rpx;
  font-weight: 600;
}

.modal-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.35;
}

.modal-close {
  font-size: 32rpx;
  color: #94a3b8;
  padding: 8rpx 14rpx;
  line-height: 1;
}

.modal-time-bar {
  margin-bottom: 24rpx;
}

.modal-time {
  font-size: 22rpx;
  color: #94a3b8;
}

.modal-content {
  font-size: 28rpx;
  color: #334155;
  line-height: 1.65;
  margin-bottom: 36rpx;
  white-space: pre-wrap;
}

.modal-footer {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.modal-btn-primary {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  border-radius: 40rpx;
  height: 80rpx;
  line-height: 80rpx;
}

.modal-btn-default {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 28rpx;
  border-radius: 40rpx;
  height: 80rpx;
  line-height: 80rpx;
}
</style>
