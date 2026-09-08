<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import {
  getScoreBalanceApi,
  getPointRecordsApi,
  type StudentScoreBalanceVO,
  type StudentPointRecordVO
} from '@/api/point'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const currentTab = ref<number | undefined>(undefined) // undefined = 全部, 100 = 收入(+), 200 = 支出(-)
const loading = ref(false)
const balanceData = ref<StudentScoreBalanceVO>({
  currentPoints: userInfo.value.currentPoints || 0,
  totalPoints: userInfo.value.totalPoints || 0,
  rank: 1
})
const recordsList = ref<StudentPointRecordVO[]>([])

const fetchBalanceAndRecords = async () => {
  loading.value = true
  try {
    const [balanceRes, recordsRes] = await Promise.all([
      getScoreBalanceApi(),
      getPointRecordsApi({ page: 1, size: 50, type: currentTab.value })
    ])
    balanceData.value = balanceRes
    recordsList.value = recordsRes?.records || []
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取明细失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleTabChange = (typeVal: number | undefined) => {
  currentTab.value = typeVal
  fetchBalanceAndRecords()
}

onPullDownRefresh(() => {
  fetchBalanceAndRecords()
})

onShow(() => {
  fetchBalanceAndRecords()
})

onMounted(() => {
  fetchBalanceAndRecords()
})
</script>

<template>
  <view class="my-points-page">
    <!-- 双积分看板卡片 -->
    <view class="pts-balance-card">
      <view class="pts-board-col">
        <view class="pts-board-label">可用积分 (current)</view>
        <view class="pts-board-num gold">
          {{ balanceData.currentPoints }}
        </view>
        <view class="pts-board-sub">可用于商城礼品兑换</view>
      </view>

      <view class="pts-board-col">
        <view class="pts-board-label">历史累计学分 (total)</view>
        <view class="pts-board-num light">
          {{ balanceData.totalPoints }}
        </view>
        <view class="pts-board-sub">全校排名第 {{ balanceData.rank || 1 }} 名</view>
      </view>
    </view>

    <!-- 筛选横条 -->
    <view class="pts-filter-strip">
      <view
        :class="['pts-tab-pill', currentTab === undefined ? 'active' : '']"
        @click="handleTabChange(undefined)"
      >
        全部收支
      </view>
      <view
        :class="['pts-tab-pill', currentTab === 100 ? 'active' : '']"
        @click="handleTabChange(100)"
      >
        收入 (+打卡/退单)
      </view>
      <view
        :class="['pts-tab-pill', currentTab === 200 ? 'active' : '']"
        @click="handleTabChange(200)"
      >
        支出 (-商城兑换)
      </view>
    </view>

    <!-- 流水列表 -->
    <view class="pts-timeline-wrap">
      <view
        v-for="r in recordsList"
        :key="r.id"
        class="pts-record-card"
      >
        <view class="pts-info-box">
          <view class="pts-title">{{ r.description }}</view>
          <view class="pts-meta">
            {{ r.createTime }} · 单号: {{ r.recordNo }}
          </view>
        </view>

        <view class="pts-val-box">
          <view :class="['pts-val-num', r.changePoints > 0 ? 'plus' : 'minus']">
            {{ r.changePoints > 0 ? '+' : '' }}{{ r.changePoints }} pts
          </view>
          <view class="pts-after-bal">余额：{{ r.afterPoints }}</view>
        </view>
      </view>

      <view v-if="!loading && recordsList.length === 0" class="empty-wrap">
        <text class="empty-icon">🪙</text>
        <text class="empty-text">暂无收支明细记录</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.my-points-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

.pts-balance-card {
  margin: 24rpx 32rpx;
  background: linear-gradient(135deg, #1e3a8a 0%, #172554 100%);
  border-radius: 16rpx;
  padding: 32rpx;
  color: #ffffff;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
}

.pts-board-col {
  display: flex;
  flex-direction: column;
}

.pts-board-col:first-child {
  border-right: 1rpx solid rgba(255, 255, 255, 0.15);
  padding-right: 24rpx;
}

.pts-board-label {
  font-size: 22rpx;
  color: #cbd5e1;
}

.pts-board-num {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 8rpx;
}

.pts-board-num.gold {
  color: #fbbf24;
}

.pts-board-num.light {
  color: #e2e8f0;
}

.pts-board-sub {
  font-size: 20rpx;
  color: #94a3b8;
  margin-top: 4rpx;
}

.pts-filter-strip {
  display: flex;
  background: #ffffff;
  padding: 16rpx 32rpx;
  gap: 16rpx;
  border-bottom: 1rpx solid #ebeef5;
}

.pts-tab-pill {
  font-size: 24rpx;
  font-weight: 500;
  color: #606266;
  padding: 10rpx 24rpx;
  border-radius: 28rpx;
  background: #f8fafc;
  border: 1rpx solid #e4e7ed;
}

.pts-tab-pill.active {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

.pts-timeline-wrap {
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.pts-record-card {
  background: #ffffff;
  border-radius: 12rpx;
  padding: 24rpx 28rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.02);
  border: 1rpx solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pts-info-box {
  flex: 1;
}

.pts-title {
  font-weight: 600;
  color: #303133;
  font-size: 26rpx;
  line-height: 1.4;
  margin-bottom: 6rpx;
}

.pts-meta {
  font-size: 22rpx;
  color: #909399;
}

.pts-val-box {
  text-align: right;
  flex-shrink: 0;
  margin-left: 24rpx;
}

.pts-val-num {
  font-size: 32rpx;
  font-weight: 700;
  font-family: monospace;
}

.pts-val-num.plus {
  color: #67c23a;
}

.pts-val-num.minus {
  color: #f56c6c;
}

.pts-after-bal {
  font-size: 22rpx;
  color: #909399;
  margin-top: 4rpx;
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  color: #909399;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 16rpx;
}

.empty-text {
  font-size: 26rpx;
}
</style>
