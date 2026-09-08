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
const { userInfo } = storeToRefs(userStore)

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

    <!-- 吸底本人排名条 -->
    <view class="my-sticky-rank">
      <view class="sticky-left">
        <view class="rank-pill">
          第 {{ myRankInfo.rank || '-' }} 名
        </view>
        <view class="sticky-text-col">
          <view class="my-name-txt">
            {{ myRankInfo.name || userInfo.name }}（本人）
          </view>
          <view class="my-sub-txt">
            <template v-if="myRankInfo.rank === 1">
              🎉 傲视群雄 · 稳居全校积分榜首！
            </template>
            <template v-else-if="diffToPrev > 0 && prevName">
              距上一名 {{ prevName }} 仅差 {{ diffToPrev }} pts
            </template>
            <template v-else>
              积极参与志愿活动提升学分排名
            </template>
          </view>
        </view>
      </view>

      <view class="sticky-right">
        <text class="my-pts-num">{{ myRankInfo.totalPoints }}</text>
        <text class="my-pts-unit">pts</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.rank-page-wrap {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 120rpx;
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

.col-second .podium-avatar-box {
  border: 4rpx solid #cbd5e1;
}

.col-third .podium-avatar-box {
  border: 4rpx solid #f59e0b;
}

.crown-icon {
  position: absolute;
  top: -24rpx;
  font-size: 32rpx;
}

.podium-name {
  font-size: 24rpx;
  font-weight: 600;
  margin-top: 8rpx;
  color: #ffffff;
}

.col-first .podium-name {
  font-size: 26rpx;
  font-weight: 700;
}

.podium-pts {
  font-size: 22rpx;
  opacity: 0.9;
  margin-top: 2rpx;
}

.gold-pts {
  color: #fef08a;
  font-weight: 600;
}

.podium-base {
  width: 100%;
  border-radius: 12rpx 12rpx 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12rpx 4rpx;
  margin-top: 12rpx;
}

.col-first .podium-base {
  height: 170rpx;
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.9) 0%, rgba(180, 83, 9, 0.9) 100%);
}

.col-second .podium-base {
  height: 136rpx;
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.8) 0%, rgba(71, 85, 105, 0.8) 100%);
}

.col-third .podium-base {
  height: 112rpx;
  background: linear-gradient(180deg, rgba(217, 119, 6, 0.8) 0%, rgba(120, 53, 15, 0.8) 100%);
}

.base-num {
  font-size: 36rpx;
  font-weight: 900;
}

.col-first .base-num {
  font-size: 44rpx;
}

.base-dept {
  font-size: 20rpx;
  opacity: 0.85;
  margin-top: 2rpx;
}

.rank-list-sheet {
  background: #ffffff;
  border-radius: 24rpx 24rpx 0 0;
  margin-top: -20rpx;
  padding: 28rpx 32rpx 120rpx;
  min-height: 600rpx;
  position: relative;
  z-index: 10;
}

.list-header-row {
  display: flex;
  justify-content: space-between;
  font-size: 22rpx;
  color: #909399;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #ebeef5;
}

.rank-row-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #ebeef5;
}

.rank-row-item.is-me-highlight {
  background: #ecf5ff;
  border-radius: 8rpx;
  padding: 20rpx 16rpx;
  margin: 8rpx -16rpx;
}

.rank-num-badge {
  width: 56rpx;
  text-align: center;
  font-size: 26rpx;
  font-weight: 700;
  color: #909399;
}

.is-me-highlight .rank-num-badge {
  color: #409eff;
}

.rank-user-avatar {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: #f0f2f5;
  color: #606266;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 600;
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
}

.rank-user-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
}

.is-me-highlight .rank-user-name {
  color: #409eff;
}

.me-tag {
  font-size: 20rpx;
  color: #409eff;
  font-weight: normal;
  margin-left: 4rpx;
}

.rank-user-dept {
  font-size: 22rpx;
  color: #909399;
  margin-top: 2rpx;
}

.rank-points-val {
  text-align: right;
  font-weight: 700;
  color: #409eff;
  font-size: 28rpx;
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

.my-sticky-rank {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1e293b;
  color: #ffffff;
  padding: 18rpx 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 90;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.15);
}

.sticky-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.rank-pill {
  font-size: 22rpx;
  font-weight: 700;
  background: #409eff;
  color: #ffffff;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.sticky-text-col {
  display: flex;
  flex-direction: column;
}

.my-name-txt {
  font-size: 24rpx;
  font-weight: 600;
}

.my-sub-txt {
  font-size: 20rpx;
  color: #94a3b8;
  margin-top: 2rpx;
}

.sticky-right {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}

.my-pts-num {
  font-size: 32rpx;
  font-weight: 700;
  color: #fbbf24;
}

.my-pts-unit {
  font-size: 22rpx;
  color: #cbd5e1;
}
</style>
