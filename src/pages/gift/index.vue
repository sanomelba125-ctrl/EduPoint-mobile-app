<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

// 兑换数量（绑定 uni-number-box 步进器组件）
const exchangeQuantity = ref(1)

// 模拟礼品信息
const giftItem = ref({
  id: 1,
  name: '校园限定定制保温杯 (500ml)',
  category: '文创周边',
  pointsPrice: 100,
  stock: 15,
  cover: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500&auto=format&fit=crop&q=60'
})

// 计算本次兑换所需总积分
const totalNeededPoints = computed(() => {
  return exchangeQuantity.value * giftItem.value.pointsPrice
})

// 改变步进器数量
const onQuantityChange = (val: number) => {
  exchangeQuantity.value = val
}

// 模拟提交兑换表单
const handleExchange = () => {
  const current = userInfo.value.currentPoints || 0
  const need = totalNeededPoints.value

  if (current < need) {
    uni.showToast({
      title: `积分不足！还差 ${need - current} 积分`,
      icon: 'none'
    })
    return
  }

  uni.showModal({
    title: '确认兑换',
    content: `将消耗 ${need} 积分兑换 ${exchangeQuantity.value} 个「${giftItem.value.name}」，是否继续？`,
    success: (res) => {
      if (res.confirm) {
        // 核心亮点：扣减 Pinia Store 积分，所有页面立即响应更新！
        userStore.updatePoints(-need)
        giftItem.value.stock -= exchangeQuantity.value
        exchangeQuantity.value = 1

        uni.showToast({
          title: '兑换成功！可在「我的兑换」中查看',
          icon: 'success'
        })
      }
    }
  })
}
</script>

<template>
  <view class="gift-page">
    <!-- 顶部常驻：当前积分余额提示栏（实时联动 Pinia） -->
    <view class="balance-bar">
      <view class="balance-left">
        <text class="balance-label">当前我的可用积分</text>
        <text class="balance-value">{{ userInfo.currentPoints }}</text>
      </view>
      <navigator url="/pages/rank/index" class="balance-rank-btn">
        查看排行榜 >
      </navigator>
    </view>

    <!-- 轮播 Banner 广告位 (基于原生 swiper + uni-ui 规范) -->
    <swiper class="gift-banner" circular autoplay interval="4000" indicator-dots indicator-active-color="#409EFF">
      <swiper-item>
        <view class="banner-item bg-blue">
          <text class="banner-title">🎁 开学季积分兑换专区开启！</text>
          <text class="banner-sub">参与社团活动即可免费获取丰厚文创</text>
        </view>
      </swiper-item>
      <swiper-item>
        <view class="banner-item bg-green">
          <text class="banner-title">⚡ 周末限时积分翻倍打卡</text>
          <text class="banner-sub">图书馆与体育馆打卡积分 +50%</text>
        </view>
      </swiper-item>
    </swiper>

    <!-- 礼品详情与兑换卡片 (使用 uni-card 组件) -->
    <uni-card 
      :title="giftItem.name" 
      :extra="'库存: ' + giftItem.stock" 
      margin="12px"
      :is-shadow="true"
    >
      <view class="gift-content">
        <image class="gift-thumb" :src="giftItem.cover" mode="aspectFill" />
        
        <view class="gift-meta">
          <view class="tag-row">
            <uni-tag :text="giftItem.category" type="primary" size="small" />
            <uni-tag text="正品校徽" type="warning" size="small" />
          </view>
          
          <view class="price-row">
            <text class="price-num">{{ giftItem.pointsPrice }}</text>
            <text class="price-unit">积分/个</text>
          </view>
        </view>
      </view>

      <!-- 兑换表单步进器组件 (使用 uni-number-box) -->
      <view class="stepper-section">
        <text class="stepper-label">兑换数量：</text>
        <uni-number-box 
          :min="1" 
          :max="Math.min(giftItem.stock, 5)" 
          :value="exchangeQuantity" 
          @change="onQuantityChange"
        />
      </view>

      <view class="total-bar">
        <text class="total-desc">合计消耗：</text>
        <text class="total-points">{{ totalNeededPoints }} 积分</text>
      </view>

      <!-- 兑换操作按钮 -->
      <button 
        class="exchange-btn" 
        :disabled="giftItem.stock <= 0"
        @click="handleExchange"
      >
        {{ giftItem.stock > 0 ? '立即确认兑换' : '已售罄' }}
      </button>
    </uni-card>
  </view>
</template>

<style scoped>
.gift-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

.balance-bar {
  background: #ffffff;
  padding: 24rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1rpx solid #ebeef5;
}

.balance-left {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.balance-label {
  font-size: 26rpx;
  color: #606266;
}

.balance-value {
  font-size: 38rpx;
  font-weight: bold;
  color: #e6a23c;
}

.balance-rank-btn {
  font-size: 24rpx;
  color: #409eff;
}

.gift-banner {
  height: 200rpx;
  margin: 20rpx 24rpx;
}

.banner-item {
  height: 100%;
  border-radius: 16rpx;
  padding: 30rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: #ffffff;
}

.bg-blue {
  background: linear-gradient(135deg, #36d1dc 0%, #5b86e5 100%);
}

.bg-green {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.banner-title {
  font-size: 30rpx;
  font-weight: bold;
}

.banner-sub {
  font-size: 22rpx;
  opacity: 0.9;
  margin-top: 10rpx;
}

.gift-content {
  display: flex;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.gift-thumb {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  background-color: #f0f2f5;
}

.gift-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.tag-row {
  display: flex;
  gap: 12rpx;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}

.price-num {
  font-size: 40rpx;
  font-weight: bold;
  color: #f56c6c;
}

.price-unit {
  font-size: 24rpx;
  color: #909399;
}

.stepper-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 0;
  border-top: 1rpx solid #f0f2f5;
  border-bottom: 1rpx solid #f0f2f5;
}

.stepper-label {
  font-size: 28rpx;
  color: #303133;
}

.total-bar {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  padding: 20rpx 0 30rpx 0;
}

.total-desc {
  font-size: 26rpx;
  color: #606266;
}

.total-points {
  font-size: 32rpx;
  font-weight: bold;
  color: #e6a23c;
}

.exchange-btn {
  background-color: #409eff;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 500;
  border-radius: 40rpx;
  height: 80rpx;
  line-height: 80rpx;
  border: none;
}

.exchange-btn[disabled] {
  background-color: #c0c4cc;
  color: #ffffff;
}
</style>
