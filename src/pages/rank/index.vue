<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import {
  getLeaderboardApi,
  type RankStudentVO,
  type StudentRankResultVO
} from '@/api/point'

const userStore = useUserStore()
const { userInfo, isLoggedIn } = storeToRefs(userStore)

const loading = ref(false)
const rankData = ref<StudentRankResultVO>({
  records: [],
  total: 0
})

const fetchRank = async () => {
  loading.value = true
  try {
    const res = await getLeaderboardApi({ page: 1, size: 50 })
    rankData.value = res
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取排行榜失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

// 提取前三名
const topFirst = computed<RankStudentVO | null>(() => {
  return rankData.value.records.length > 0 ? rankData.value.records[0] : null
})

const topSecond = computed<RankStudentVO | null>(() => {
  return rankData.value.records.length > 1 ? rankData.value.records[1] : null
})

const topThird = computed<RankStudentVO | null>(() => {
  return rankData.value.records.length > 2 ? rankData.value.records[2] : null
})

// 第 4 名及后续列表
const remainingRecords = computed<RankStudentVO[]>(() => {
  return rankData.value.records.length > 3 ? rankData.value.records.slice(3) : []
})

// 本人位次数据
const myRankInfo = computed(() => {
  return rankData.value.myRank || {
    rank: userInfo.value.currentPoints ? 1 : 0,
    name: userInfo.value.name || '我',
    totalPoints: userInfo.value.totalPoints || 0
  }
})

const diffToPrev = computed(() => rankData.value.diffToPrevious || 0)
const prevName = computed(() => rankData.value.previousStudentName || '')

// 点击吸底栏跳转逻辑
const handleStickyBarClick = () => {
  if (!isLoggedIn.value) {
    uni.navigateTo({ url: '/pages/login/index' })
  } else {
    uni.navigateTo({ url: '/pages/my/points' })
  }
}

onPullDownRefresh(() => {
  fetchRank()
})

onShow(() => {
  fetchRank()
})

onMounted(() => {
  fetchRank()
})
</script>

<template>
  <view class="rank-page-wrap">
    <!-- 顶部领奖台区域 -->
    <view class="rank-top-hero">
      <view class="rank-subtitle">
        依据历史累计获取总积分 (total_points) 排序 · 礼品兑换不扣减榜单排名
      </view>

      <view v-if="rankData.records.length > 0" class="podium-wrap">
        <!-- 亚军 2 -->
        <view v-if="topSecond" class="podium-col col-second">
          <view class="podium-avatar-box">
            <text class="crown-icon">👑</text>
            <text class="avatar-letter">{{ topSecond.name ? topSecond.name.charAt(0) : '2' }}</text>
          </view>
          <view class="podium-name">{{ topSecond.name }}</view>
          <view class="podium-pts">{{ topSecond.totalPoints }} pts</view>
          <view class="podium-base">
            <text class="base-num">2</text>
            <text class="base-dept">{{ topSecond.college || '本校院系' }}</text>
          </view>
        </view>

        <!-- 冠军 1 -->
        <view v-if="topFirst" class="podium-col col-first">
          <view class="podium-avatar-box">
            <text class="crown-icon gold">👑</text>
            <text class="avatar-letter">{{ topFirst.name ? topFirst.name.charAt(0) : '1' }}</text>
          </view>
          <view class="podium-name">{{ topFirst.name }}</view>
          <view class="podium-pts gold-pts">{{ topFirst.totalPoints }} pts</view>
          <view class="podium-base">
            <text class="base-num">1</text>
            <text class="base-dept">{{ topFirst.college || '本校院系' }}</text>
          </view>
        </view>

        <!-- 季军 3 -->
        <view v-if="topThird" class="podium-col col-third">
          <view class="podium-avatar-box">
            <text class="crown-icon bronze">👑</text>
            <text class="avatar-letter">{{ topThird.name ? topThird.name.charAt(0) : '3' }}</text>
          </view>
          <view class="podium-name">{{ topThird.name }}</view>
          <view class="podium-pts">{{ topThird.totalPoints }} pts</view>
          <view class="podium-base">
            <text class="base-num">3</text>
            <text class="base-dept">{{ topThird.college || '本校院系' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 4名以后列表区域 -->
    <view class="rank-list-sheet">
      <view class="list-header-row">
        <text>名次 / 同学</text>
        <text>累计总学分</text>
      </view>

      <view
        v-for="item in remainingRecords"
        :key="item.studentId"
        :class="['rank-row-item', item.isMe ? 'is-me-highlight' : '']"
      >
        <view class="rank-num-badge">{{ item.rank }}</view>
        <view :class="['rank-user-avatar', item.isMe ? 'avatar-me' : '']">
          {{ item.name ? item.name.charAt(0) : '生' }}
        </view>
        <view class="rank-user-details">
          <view class="rank-user-name">
            {{ item.name }}
            <text v-if="item.isMe" class="me-tag">（本人）</text>
          </view>
          <view class="rank-user-dept">
            {{ item.college || '学工部' }}
            <text v-if="item.className"> · {{ item.className }}</text>
          </view>
        </view>
        <view class="rank-points-val">
          {{ item.totalPoints }} <text class="pts-unit-txt">pts</text>
        </view>
      </view>

      <view v-if="!loading && remainingRecords.length === 0 && rankData.records.length <= 3" class="no-more-txt">
        已加载全部上榜同学
      </view>
    </view>

    <!-- 底部常驻吸底栏：展示当前登录学生全校排名与积分 (吸附在 TabBar 正上方) -->
    <view class="my-sticky-rank" @tap="handleStickyBarClick">
      <!-- 已登录状态展示真实全校排名与积分 -->
      <template v-if="isLoggedIn">
        <view class="sticky-left">
          <!-- 排名胶囊徽章 -->
          <view :class="['rank-pill', myRankInfo.rank === 1 ? 'pill-gold' : myRankInfo.rank === 2 ? 'pill-silver' : myRankInfo.rank === 3 ? 'pill-bronze' : 'pill-blue']">
            <text v-if="myRankInfo.rank === 1" class="pill-crown">👑</text>
            第 {{ myRankInfo.rank > 0 ? myRankInfo.rank : '-' }} 名
          </view>
          <view class="sticky-text-col">
            <view class="my-name-row">
              <text class="my-name-txt">{{ myRankInfo.name || userInfo.name }}</text>
              <text class="me-tag-pill">本人</text>
            </view>
            <view class="my-sub-txt">
              <template v-if="myRankInfo.rank === 1">
                🎉 傲视群雄 · 稳居全校积分榜首！
              </template>
              <template v-else-if="diffToPrev > 0 && prevName">
                🔥 距上一名 {{ prevName }} 仅差 {{ diffToPrev }} pts
              </template>
              <template v-else>
                积极参与校园打卡活动提升学分排名
              </template>
            </view>
          </view>
        </view>

        <view class="sticky-right">
          <view class="pts-box">
            <text class="my-pts-num">{{ myRankInfo.totalPoints }}</text>
            <text class="my-pts-unit">pts</text>
          </view>
          <text class="detail-arrow">明细 ›</text>
        </view>
      </template>

      <!-- 未登录引导状态 -->
      <template v-else>
        <view class="sticky-left unlogged-box">
          <text class="unlogged-icon">🔒</text>
          <view class="sticky-text-col">
            <view class="my-name-txt">尚未登录学生身份</view>
            <view class="my-sub-txt">点击前往认证登录，解锁查看全校学分位次</view>
          </view>
        </view>
        <view class="sticky-right">
          <view class="login-action-btn">去登录 ›</view>
        </view>
      </template>
    </view>
  </view>
</template>

<style scoped>
.rank-page-wrap {
  min-height: 100vh;
  background-color: #f5f6f8;
  /* 留足常驻吸底栏（约 120rpx）和系统 TabBar（约 50px）空间，确保最末行可滚动到底部 */
  padding-bottom: calc(140rpx + var(--window-bottom, 50px) + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.rank-top-hero {
  background: linear-gradient(180deg, #1e3a8a 0%, #172554 100%);
  color: #ffffff;
  padding: 24rpx 32rpx 48rpx;
  text-align: center;
}

.rank-subtitle {
  font-size: 22rpx;
  color: #cbd5e1;
  margin-top: 4rpx;
  line-height: 1.4;
}

.podium-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 20rpx;
  margin-top: 36rpx;
}

.podium-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.podium-avatar-box {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #ffffff;
  color: #1e3a8a;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.25);
}

.avatar-letter {
  font-size: 32rpx;
  font-weight: 700;
}

.col-first .podium-avatar-box {
  width: 116rpx;
  height: 116rpx;
  border: 4rpx solid #fbbf24;
  color: #b45309;
}

.col-first .avatar-letter {
  font-size: 38rpx;
}

.crown-icon {
  position: absolute;
  top: -24rpx;
  font-size: 28rpx;
}

.crown-icon.gold {
  top: -30rpx;
  font-size: 36rpx;
}

.crown-icon.bronze {
  filter: sepia(0.8);
}

.podium-name {
  font-size: 26rpx;
  font-weight: 600;
  margin-top: 14rpx;
  color: #ffffff;
  max-width: 160rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium-pts {
  font-size: 22rpx;
  color: #93c5fd;
  margin-top: 4rpx;
}

.gold-pts {
  color: #fbbf24;
  font-weight: 700;
}

.podium-base {
  width: 100%;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 12rpx 12rpx 0 0;
  padding: 16rpx 0;
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.col-first .podium-base {
  height: 120rpx;
  background: rgba(251, 191, 36, 0.2);
  border: 1rpx solid rgba(251, 191, 36, 0.4);
  border-bottom: none;
}

.col-second .podium-base {
  height: 96rpx;
}

.col-third .podium-base {
  height: 76rpx;
}

.base-num {
  font-size: 32rpx;
  font-weight: 800;
  color: #ffffff;
}

.col-first .base-num {
  font-size: 38rpx;
  color: #fbbf24;
}

.base-dept {
  font-size: 18rpx;
  color: #94a3b8;
  margin-top: 2rpx;
  max-width: 140rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 列表容器 */
.rank-list-sheet {
  background: #ffffff;
  border-radius: 28rpx 28rpx 0 0;
  margin-top: -20rpx;
  padding: 24rpx 32rpx;
  position: relative;
  z-index: 10;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.list-header-row {
  display: flex;
  justify-content: space-between;
  font-size: 22rpx;
  color: #94a3b8;
  padding: 8rpx 12rpx 16rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.rank-row-item {
  display: flex;
  align-items: center;
  padding: 24rpx 12rpx;
  border-bottom: 1rpx solid #f8fafc;
  transition: background-color 0.2s ease;
}

.is-me-highlight {
  background-color: #f0fdf4;
  border-radius: 16rpx;
  border-bottom: 1rpx solid transparent;
}

.rank-num-badge {
  font-size: 28rpx;
  font-weight: 700;
  color: #64748b;
  width: 52rpx;
  text-align: center;
  flex-shrink: 0;
}

.rank-user-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 12rpx;
  flex-shrink: 0;
}

.avatar-me {
  background: #409eff;
  color: #ffffff;
}

.rank-user-details {
  flex: 1;
  margin-left: 20rpx;
  min-width: 0;
}

.rank-user-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.me-tag {
  font-size: 20rpx;
  color: #10b981;
  font-weight: normal;
}

.rank-user-dept {
  font-size: 22rpx;
  color: #94a3b8;
  margin-top: 4rpx;
}

.rank-points-val {
  font-size: 32rpx;
  font-weight: 700;
  color: #0f172a;
  flex-shrink: 0;
}

.pts-unit-txt {
  font-size: 22rpx;
  color: #909399;
  font-weight: normal;
  margin-left: 4rpx;
}

.no-more-txt {
  text-align: center;
  padding: 40rpx 0;
  font-size: 22rpx;
  color: #c0c4cc;
}

/* =======================================================
   底部常驻吸底栏 (固定吸附在 uni-tabbar 正上方)
   ======================================================= */
.my-sticky-rank {
  position: fixed;
  left: 0;
  right: 0;
  /* 核心：吸附在 uni-app 原生/自定义 TabBar 之上 */
  bottom: var(--window-bottom, 50px);
  z-index: 99;
  box-sizing: border-box;
  padding: 16rpx 28rpx;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.98) 100%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 2rpx solid rgba(251, 191, 36, 0.35);
  box-shadow: 0 -8rpx 30rpx rgba(0, 0, 0, 0.35);
  transition: all 0.25s ease;
}

.my-sticky-rank:active {
  background: rgba(30, 41, 59, 0.98);
}

.sticky-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  min-width: 0;
}

.unlogged-box {
  gap: 14rpx;
}

.unlogged-icon {
  font-size: 36rpx;
}

.rank-pill {
  font-size: 22rpx;
  font-weight: 700;
  padding: 6rpx 18rpx;
  border-radius: 24rpx;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4rpx;
  flex-shrink: 0;
}

.pill-gold {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(245, 158, 11, 0.4);
}

.pill-silver {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  color: #ffffff;
}

.pill-bronze {
  background: linear-gradient(135deg, #b45309 0%, #78350f 100%);
  color: #ffffff;
}

.pill-blue {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: #ffffff;
}

.pill-crown {
  font-size: 20rpx;
}

.sticky-text-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.my-name-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.my-name-txt {
  font-size: 26rpx;
  font-weight: 700;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-tag-pill {
  font-size: 18rpx;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  border: 1rpx solid rgba(56, 189, 248, 0.4);
  padding: 0rpx 10rpx;
  border-radius: 12rpx;
}

.my-sub-txt {
  font-size: 20rpx;
  color: #94a3b8;
  margin-top: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 20rpx;
  flex-shrink: 0;
}

.pts-box {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}

.my-pts-num {
  font-size: 34rpx;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: -0.5rpx;
}

.my-pts-unit {
  font-size: 20rpx;
  color: #cbd5e1;
}

.detail-arrow {
  font-size: 20rpx;
  color: #64748b;
  margin-top: 2rpx;
}

.login-action-btn {
  font-size: 22rpx;
  font-weight: 600;
  color: #ffffff;
  background: #2563eb;
  padding: 10rpx 22rpx;
  border-radius: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(37, 99, 235, 0.35);
}
</style>
