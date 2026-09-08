<script setup lang="ts">
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

// 模拟快捷积分变更（便于测试 Pinia 跨页面实时响应）
const handleAddPoints = (pts: number) => {
  userStore.updatePoints(pts)
  uni.showToast({
    title: `已${pts > 0 ? '增加' : '扣除'} ${Math.abs(pts)} 积分`,
    icon: 'none'
  })
}

// 登录跳转
const handleUserCardClick = () => {
  if (!userStore.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
  }
}

// 退出登录
const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确认退出当前账号吗？',
    success: (res) => {
      if (res.confirm) {
        userStore.logout()
        uni.showToast({ title: '已退出登录', icon: 'none' })
        setTimeout(() => {
          uni.navigateTo({ url: '/pages/login/index' })
        }, 500)
      }
    }
  })
}

// 页面导航安全封装（避免模板直接调用全局 uni 导致 undefined）
const navTo = (url: string) => {
  uni.navigateTo({ url })
}
</script>

<template>
  <view class="my-page">
    <!-- 用户信息头部卡片 -->
    <view class="user-card" @click="handleUserCardClick">
      <view class="avatar-wrap">
        <image 
          class="avatar" 
          :src="userInfo.avatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'" 
          mode="aspectFill" 
        />
      </view>
      <view class="user-info">
        <text class="user-name">{{ userInfo.name || '点击登录 / 认证学籍' }}</text>
        <text class="user-no">{{ userInfo.studentNo ? `学号: ${userInfo.studentNo}` : '未登录状态' }}</text>
      </view>
    </view>

    <!-- 核心响应式资产卡片（基于 Pinia 状态管理） -->
    <uni-card margin="12px" :is-shadow="true" class="points-card">
      <view class="points-header">
        <text class="points-title">我的学分与积分</text>
        <uni-tag text="Pinia 全局响应" type="success" size="small" />
      </view>
      <view class="points-stats">
        <view class="stat-item">
          <text class="stat-num highlight">{{ userInfo.currentPoints }}</text>
          <text class="stat-label">可用积分余额</text>
        </view>
        <view class="stat-divider" />
        <view class="stat-item">
          <text class="stat-num">{{ userInfo.totalPoints }}</text>
          <text class="stat-label">累计获取积分</text>
        </view>
      </view>
      
      <!-- 快捷测试条：便于测试跨页面积分响应 -->
      <view class="quick-actions">
        <text class="quick-title">协同开发测试（实时驱动全局状态）:</text>
        <view class="btn-group">
          <button class="mini-btn add" @click="handleAddPoints(50)">+50 积分</button>
          <button class="mini-btn sub" @click="handleAddPoints(-20)">-20 积分</button>
        </view>
      </view>
    </uni-card>

    <!-- 业务功能菜单列表 (uni-ui 基础组件演示) -->
    <view class="menu-section">
      <uni-list>
        <uni-list-item 
          title="我的活动打卡" 
          show-arrow 
          show-extra-icon 
          :extra-icon="{ color: '#409EFF', size: '22', type: 'calendar' }" 
        />
        <uni-list-item 
          title="我的礼品兑换" 
          show-arrow 
          show-extra-icon 
          clickable
          :extra-icon="{ color: '#67C23A', size: '22', type: 'cart' }" 
          @click="navTo('/pages/my/orders')"
        />
        <uni-list-item 
          title="积分变动明细" 
          show-arrow 
          show-extra-icon 
          clickable
          :extra-icon="{ color: '#E6A23C', size: '22', type: 'wallet' }" 
          @click="navTo('/pages/my/points')"
        />
        <uni-list-item 
          title="个人设置与账号" 
          show-arrow 
          show-extra-icon 
          :extra-icon="{ color: '#909399', size: '22', type: 'gear' }" 
        />
      </uni-list>
    </view>

    <!-- 退出登录按钮 -->
    <view class="logout-wrap">
      <button class="logout-btn" @click="handleLogout">退出当前账号</button>
    </view>
  </view>
</template>

<style scoped>
.my-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

.user-card {
  background: linear-gradient(135deg, #409EFF 0%, #2b73d2 100%);
  padding: 60rpx 40rpx 70rpx 40rpx;
  display: flex;
  align-items: center;
  color: #ffffff;
}

.avatar-wrap {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  overflow: hidden;
  border: 4rpx solid rgba(255, 255, 255, 0.6);
  margin-right: 28rpx;
}

.avatar {
  width: 100%;
  height: 100%;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 36rpx;
  font-weight: bold;
}

.user-no {
  font-size: 26rpx;
  opacity: 0.85;
  margin-top: 10rpx;
}

.points-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.points-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

.points-stats {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 16rpx 0 24rpx 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 44rpx;
  font-weight: bold;
  color: #303133;
}

.stat-num.highlight {
  color: #e6a23c;
}

.stat-label {
  font-size: 24rpx;
  color: #909399;
  margin-top: 8rpx;
}

.stat-divider {
  width: 2rpx;
  height: 60rpx;
  background-color: #ebeef5;
}

.quick-actions {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed #ebeef5;
}

.quick-title {
  font-size: 22rpx;
  color: #909399;
}

.btn-group {
  display: flex;
  gap: 16rpx;
  margin-top: 12rpx;
}

.mini-btn {
  flex: 1;
  font-size: 24rpx;
  line-height: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  border: none;
}

.mini-btn.add {
  background-color: #f0f9eb;
  color: #67c23a;
}

.mini-btn.sub {
  background-color: #fef0f0;
  color: #f56c6c;
}

.menu-section {
  margin: 24rpx;
  border-radius: 16rpx;
  overflow: hidden;
  background-color: #ffffff;
}

.logout-wrap {
  margin: 40rpx 24rpx;
}

.logout-btn {
  background-color: #ffffff;
  color: #f56c6c;
  font-size: 28rpx;
  font-weight: 500;
  border-radius: 16rpx;
  height: 80rpx;
  line-height: 80rpx;
  border: none;
}
</style>
