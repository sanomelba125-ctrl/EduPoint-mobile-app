<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import { getGiftListApi, type GiftItem } from '@/api/gift'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const currentTab = ref<'ALL' | 'AFFORDABLE' | 'FEATURED'>('ALL')
const loading = ref(false)
const giftList = ref<GiftItem[]>([])
const page = ref(1)
const pageSize = 12
const hasMore = ref(true)

const currentPoints = computed(() => userInfo.value.currentPoints || 0)

const fetchGifts = async (reset = false) => {
  if (loading.value) return
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (!hasMore.value) return

  loading.value = true
  try {
    const res: any = await getGiftListApi({ status: 1, page: page.value, size: pageSize })
    const list: GiftItem[] = res?.records || (Array.isArray(res) ? res : [])
    if (reset) {
      giftList.value = list
    } else {
      giftList.value = [...giftList.value, ...list]
    }
    hasMore.value = list.length >= pageSize
    if (hasMore.value) {
      page.value++
    }
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取礼品失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const filteredGifts = computed(() => {
  const points = currentPoints.value
  if (currentTab.value === 'AFFORDABLE') {
    return giftList.value.filter(g => g.stock > 0 && g.pointsCost <= points)
  }
  if (currentTab.value === 'FEATURED') {
    // 推荐库存充裕或高价值礼品
    return giftList.value.filter(g => g.stock > 5)
  }
  return giftList.value
})

const handleTabChange = (tab: 'ALL' | 'AFFORDABLE' | 'FEATURED') => {
  currentTab.value = tab
}

const goToDetail = (id: number) => {
  uni.navigateTo({
    url: `/pages/gift/detail?id=${id}`
  })
}

const goToOrders = () => {
  uni.navigateTo({
    url: '/pages/my/orders'
  })
}

const goToRank = () => {
  uni.switchTab({
    url: '/pages/rank/index'
  })
}

onPullDownRefresh(() => {
  fetchGifts(true)
})

onReachBottom(() => {
  if (!loading.value && hasMore.value) {
    fetchGifts(false)
  }
})

onShow(() => {
  fetchGifts(true)
})

onMounted(() => {
  fetchGifts(true)
})
</script>

<template>
  <view class="gift-mall-container">
    <!-- 积分卡片 -->
    <view class="mall-banner-card">
      <view class="mall-balance-top">
        <view>
          <view class="mall-balance-label">当前可用积分 (current_points)</view>
          <view class="mall-balance-value">
            {{ currentPoints }}
            <text class="mall-pts-unit">pts</text>
          </view>
        </view>
        <view class="balance-rank-badge" @click="goToRank">
          积分光荣榜 >
        </view>
      </view>

      <view class="mall-balance-actions">
        <view class="mall-action-link" @click="goToOrders">
          <text class="action-icon">📋</text>
          <text class="action-text">我的兑换订单 (出示提货码)</text>
          <text class="action-arrow">></text>
        </view>
      </view>
    </view>

    <!-- 筛选分段横条 -->
    <view class="mall-filter-strip">
      <view class="filter-tabs">
        <view
          :class="['filter-tab-pill', currentTab === 'ALL' ? 'active' : '']"
          @click="handleTabChange('ALL')"
        >
          全部商品
        </view>
        <view
          :class="['filter-tab-pill', currentTab === 'AFFORDABLE' ? 'active' : '']"
          @click="handleTabChange('AFFORDABLE')"
        >
          我能兑换
        </view>
        <view
          :class="['filter-tab-pill', currentTab === 'FEATURED' ? 'active' : '']"
          @click="handleTabChange('FEATURED')"
        >
          精选推荐
        </view>
      </view>
      <text class="strip-tip">凭提货码线下核销</text>
    </view>

    <!-- 礼品双列网格 -->
    <view class="gift-grid">
      <view
        v-for="item in filteredGifts"
        :key="item.id"
        class="gift-item-card"
        @click="goToDetail(item.id)"
      >
        <view class="gift-thumb-box">
          <image
            v-if="item.image"
            :src="item.image"
            mode="aspectFill"
            class="thumb-img"
          />
          <view v-else class="thumb-placeholder">
            <text class="placeholder-icon">🎁</text>
          </view>
          <view v-if="item.stock <= 0" class="out-of-stock-mask">
            已兑罄
          </view>
        </view>

        <view class="gift-item-body">
          <view class="gift-item-title">{{ item.name }}</view>
          <view class="gift-pts-row">
            <text class="pts-number">{{ item.pointsCost }}</text>
            <text class="pts-unit"> pts</text>
          </view>
          <view class="gift-sub-row">
            <text class="stock-text">库存 {{ item.stock }} 件</text>
            <text
              :class="[
                'afford-status',
                item.stock <= 0
                  ? 'empty'
                  : item.pointsCost <= currentPoints
                  ? 'can'
                  : 'cannot'
              ]"
            >
              {{
                item.stock <= 0
                  ? '补货中'
                  : item.pointsCost <= currentPoints
                  ? '可兑换'
                  : '积分不足'
              }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && filteredGifts.length === 0" class="empty-wrap">
      <text class="empty-icon">📦</text>
      <text class="empty-text">当前暂无可兑换的礼品</text>
    </view>

    <!-- 分页触底加载状态提示 -->
    <view v-if="filteredGifts.length > 0" class="load-more-status">
      <text v-if="loading" class="status-text">正在加载更多礼品...</text>
      <text v-else-if="!hasMore" class="status-text">—— 到底了，共 {{ giftList.length }} 件上架礼品 ——</text>
      <text v-else class="status-text" @click="fetchGifts(false)">上滑或点击加载更多</text>
    </view>
  </view>
</template>

<style scoped>
.load-more-status {
  padding: 30rpx 0 20rpx;
  text-align: center;
}

.status-text {
  font-size: 24rpx;
  color: #94a3b8;
}

.gift-mall-container {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

.mall-banner-card {
  margin: 24rpx 32rpx;
  background: linear-gradient(135deg, #1e3a8a 0%, #172554 100%);
  border-radius: 16rpx;
  padding: 32rpx;
  color: #ffffff;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.12);
}

.mall-balance-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mall-balance-label {
  font-size: 24rpx;
  color: #cbd5e1;
}

.mall-balance-value {
  font-size: 56rpx;
  font-weight: 700;
  color: #fbbf24;
  line-height: 1.2;
  margin-top: 8rpx;
}

.mall-pts-unit {
  font-size: 26rpx;
  font-weight: normal;
  color: #fde68a;
  margin-left: 8rpx;
}

.balance-rank-badge {
  background: rgba(255, 255, 255, 0.18);
  border: 1rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 28rpx;
  padding: 8rpx 20rpx;
  font-size: 22rpx;
  color: #ffffff;
}

.mall-balance-actions {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.14);
}

.mall-action-link {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 24rpx;
  color: #e2e8f0;
}

.action-icon {
  font-size: 26rpx;
}

.action-text {
  flex: 1;
}

.action-arrow {
  color: #94a3b8;
  font-size: 24rpx;
}

.mall-filter-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 32rpx 20rpx;
}

.filter-tabs {
  display: flex;
  gap: 12rpx;
}

.filter-tab-pill {
  padding: 8rpx 24rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: #606266;
  background: #f0f2f5;
  border: 1rpx solid #e4e7ed;
}

.filter-tab-pill.active {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

.strip-tip {
  font-size: 22rpx;
  color: #909399;
}

.gift-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  padding: 0 32rpx 40rpx;
}

.gift-item-card {
  background: #ffffff;
  border-radius: 12rpx;
  border: 1rpx solid #ebeef5;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.02);
}

.gift-thumb-box {
  height: 240rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.thumb-img {
  width: 100%;
  height: 100%;
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 80rpx;
  opacity: 0.8;
}

.out-of-stock-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.gift-item-body {
  padding: 18rpx;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.gift-item-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
  line-height: 1.4;
  margin-bottom: 12rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 72rpx;
}

.gift-pts-row {
  display: flex;
  align-items: baseline;
  color: #e6a23c;
  font-weight: 700;
  margin-top: auto;
}

.pts-number {
  font-size: 34rpx;
}

.pts-unit {
  font-size: 22rpx;
  color: #909399;
  font-weight: normal;
}

.gift-sub-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 22rpx;
  margin-top: 8rpx;
}

.stock-text {
  color: #909399;
}

.afford-status.can {
  color: #67c23a;
  font-weight: 500;
}

.afford-status.cannot {
  color: #909399;
}

.afford-status.empty {
  color: #f56c6c;
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
