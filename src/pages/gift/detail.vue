<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import {
  getGiftDetailApi,
  exchangeGiftApi,
  type GiftItem,
  type GiftExchangeResult
} from '@/api/gift'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const giftId = ref<number>(0)
const loading = ref(false)
const gift = ref<GiftItem | null>(null)
const quantity = ref(1)
const submitting = ref(false)

// 提货核验信息（默认带入学籍档案资料，亦支持编辑）
const receiverName = ref(userInfo.value.name || '张晓明')
const receiverPhone = ref(userInfo.value.phone || '13911110006')
const receiverAddress = ref('大学生活动中心一楼 102 创客服务台')

import { watch } from 'vue'
watch(
  () => userInfo.value,
  (val) => {
    if (val && val.name) receiverName.value = val.name
    if (val && val.phone) receiverPhone.value = val.phone
  },
  { immediate: true }
)

// 兑换成功弹窗状态
const showSuccessModal = ref(false)
const exchangeResult = ref<GiftExchangeResult | null>(null)

const currentPoints = computed(() => userInfo.value.currentPoints || 0)

const totalCost = computed(() => {
  if (!gift.value) return 0
  return (gift.value.pointsCost || 0) * quantity.value
})

const afterBalance = computed(() => {
  return currentPoints.value - totalCost.value
})

const canExchange = computed(() => {
  if (!gift.value) return false
  if (gift.value.stock < quantity.value) return false
  if (currentPoints.value < totalCost.value) return false
  return true
})

const fetchDetail = async () => {
  if (!giftId.value) return
  loading.value = true
  try {
    const res = await getGiftDetailApi(giftId.value)
    gift.value = res
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取礼品详情失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

const adjustQty = (delta: number) => {
  if (!gift.value) return
  const next = quantity.value + delta
  if (next < 1) return
  const maxAllowed = Math.min(gift.value.stock, 5)
  if (next > maxAllowed) {
    uni.showToast({ title: `每次最多兑换 ${maxAllowed} 件`, icon: 'none' })
    return
  }
  quantity.value = next
}

const handleExchange = async () => {
  if (!gift.value || submitting.value) return
  if (!canExchange.value) {
    if (gift.value.stock < quantity.value) {
      uni.showToast({ title: '库存不足', icon: 'none' })
    } else {
      uni.showToast({ title: '积分不足，无法兑换', icon: 'none' })
    }
    return
  }

  const finalName = receiverName.value.trim() || userInfo.value.name || '张晓明'
  const finalPhone = receiverPhone.value.trim() || userInfo.value.phone || '13911110006'
  const finalAddress = receiverAddress.value.trim() || '大学生活动中心一楼 102 创客服务台'

  if (!finalPhone) {
    uni.showToast({ title: '请输入提货联系电话', icon: 'none' })
    return
  }

  uni.showModal({
    title: '确认兑换礼品',
    content: `将消耗 ${totalCost.value} 积分兑换 ${quantity.value} 件「${gift.value.name}」，核销提货人：${finalName}（${finalPhone}），是否确认？`,
    confirmText: '立即兑换',
    cancelText: '再想想',
    success: async (res) => {
      if (!res.confirm) return
      submitting.value = true
      try {
        const result = await exchangeGiftApi({
          giftId: gift.value!.id,
          quantity: quantity.value,
          receiverName: finalName,
          receiverPhone: finalPhone,
          receiverAddress: finalAddress
        })

        // 核心亮点：全局更新 Pinia 中的用户可用积分
        userStore.updatePoints(-totalCost.value)
        if (gift.value) {
          gift.value.stock = Math.max(0, gift.value.stock - quantity.value)
        }

        exchangeResult.value = result
        showSuccessModal.value = true
      } catch (err: any) {
        uni.showToast({ title: err.message || '兑换失败，请稍后重试', icon: 'none' })
      } finally {
        submitting.value = false
      }
    }
  })
}

const goToOrders = () => {
  showSuccessModal.value = false
  uni.navigateTo({
    url: '/pages/my/orders'
  })
}

const goToMall = () => {
  showSuccessModal.value = false
  uni.navigateBack()
}

onLoad((query: any) => {
  if (query && query.id) {
    giftId.value = Number(query.id)
    fetchDetail()
  }
})
</script>

<template>
  <view class="gift-detail-page">
    <!-- 顶部大图展示 -->
    <view class="hero-image-box">
      <image
        v-if="gift?.image"
        :src="gift.image"
        mode="aspectFit"
        class="hero-img"
      />
      <view v-else class="hero-placeholder">
        <text class="placeholder-icon">🎁</text>
      </view>
    </view>

    <!-- 详情卡片内容 -->
    <view v-if="gift" class="content-wrap">
      <!-- 基础分值与标题 -->
      <view class="detail-card">
        <view class="points-row">
          <text class="unit-points">{{ gift.pointsCost }}</text>
          <text class="unit-text">积分 / 件 (pts)</text>
        </view>
        <view class="detail-title">{{ gift.name }}</view>
        <view class="meta-row">
          <text class="stock-info">
            库存剩余：<text class="stock-val">{{ gift.stock }}</text> 件
          </text>
          <view class="tag-pill">线下自提 · 乐观锁防超卖</view>
        </view>
        <view v-if="gift.description" class="gift-desc">
          {{ gift.description }}
        </view>
      </view>

      <!-- 数量步进控制 -->
      <view class="detail-card">
        <view class="stepper-row">
          <view>
            <view class="stepper-title">兑换数量 (quantity)</view>
            <view class="stepper-sub">每单限兑 5 件 · 扣减可用积分</view>
          </view>
          <view class="stepper-box">
            <button class="step-btn" :disabled="quantity <= 1" @click="adjustQty(-1)">-</button>
            <text class="step-val">{{ quantity }}</text>
            <button class="step-btn" :disabled="quantity >= Math.min(gift.stock, 5)" @click="adjustQty(1)">+</button>
          </view>
        </view>

        <view class="balance-calc-bar">
          <text>当前可用余额: <text class="font-bold">{{ currentPoints }}</text> 积分</text>
          <text>
            扣除后剩余:
            <text :class="['font-bold', afterBalance >= 0 ? 'text-success' : 'text-danger']">
              {{ afterBalance }}
            </text> 积分
          </text>
        </view>
      </view>

      <!-- 提货核验信息 -->
      <view class="detail-card">
        <view class="section-header-row">
          <text class="notice-title">提货核验信息</text>
          <text class="tag-auto">已匹配学籍档案</text>
        </view>
        <view class="delivery-form">
          <view class="form-row">
            <text class="form-label">提货姓名</text>
            <input class="form-input" v-model="receiverName" placeholder="提货人姓名" />
          </view>
          <view class="form-row">
            <text class="form-label">联系电话</text>
            <input class="form-input" v-model="receiverPhone" type="number" placeholder="现场核销联系电话" />
          </view>
          <view class="form-row">
            <text class="form-label">自提地点</text>
            <input class="form-input" v-model="receiverAddress" placeholder="自提服务点" />
          </view>
        </view>
      </view>

      <!-- 提货与履约须知 -->
      <view class="detail-card">
        <view class="notice-title">提货与履约须知</view>
        <view class="notice-list">
          <view class="notice-item">• <text class="item-bold">自提地点：</text>大学生活动中心一楼 102 创客服务台</view>
          <view class="notice-item">• <text class="item-bold">开放时间：</text>周一至周五 09:00 - 17:30</view>
          <view class="notice-item">• <text class="item-bold">核销流程：</text>兑换成功将生成 8 位专属提货码，由现场管理员扫码核销。</view>
          <view class="notice-item">• <text class="item-bold">退单政策：</text>核销前可在「我的订单」随时自主取消，积分即时原路退回。</view>
        </view>
      </view>
    </view>

    <!-- 底部固定兑换条 -->
    <view v-if="gift" class="fixed-bottom-bar">
      <view class="cost-summary">
        <view class="cost-label">合计所需积分</view>
        <view class="cost-number">
          {{ totalCost }} <text class="cost-unit">积分</text>
        </view>
      </view>
      <button
        class="exchange-submit-btn"
        :disabled="!canExchange || submitting"
        @click="handleExchange"
      >
        {{
          gift.stock <= 0
            ? '已兑罄'
            : currentPoints < totalCost
            ? '可用积分不足'
            : submitting
            ? '兑换处理中...'
            : '立即确认兑换'
        }}
      </button>
    </view>

    <!-- 兑换成功凭证弹窗 -->
    <view v-if="showSuccessModal" class="modal-mask">
      <view class="modal-card">
        <view class="success-icon-box">
          <text class="success-icon">✓</text>
        </view>
        <view class="success-title">兑换成功</view>
        <view class="success-sub">请凭下方提货码至大活 102 室现场核销领取</view>

        <view class="pickup-code-display">
          {{ exchangeResult?.pickupCode || 'PK-8892-01' }}
        </view>

        <!-- 条形码示意装饰 -->
        <view class="mock-barcode">
          <view class="bar w-2"></view>
          <view class="bar w-4 ml-2"></view>
          <view class="bar w-1 ml-3"></view>
          <view class="bar w-3 ml-1"></view>
          <view class="bar w-2 ml-4"></view>
          <view class="bar w-5 ml-2"></view>
          <view class="bar w-2 ml-3"></view>
          <view class="bar w-4 ml-1"></view>
          <view class="bar w-1 ml-2"></view>
          <view class="bar w-3 ml-4"></view>
          <view class="bar w-2 ml-2"></view>
          <view class="bar w-4 ml-1"></view>
          <view class="bar w-2 ml-3"></view>
          <view class="bar w-5 ml-2"></view>
        </view>

        <view class="modal-btns">
          <button class="modal-btn outline" @click="goToMall">继续逛逛</button>
          <button class="modal-btn primary" @click="goToOrders">查看订单</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.gift-detail-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 140rpx;
}

.hero-image-box {
  height: 420rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1rpx solid #ebeef5;
}

.hero-img {
  width: 100%;
  height: 100%;
}

.hero-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 140rpx;
  opacity: 0.85;
}

.content-wrap {
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.detail-card {
  background: #ffffff;
  border-radius: 16rpx;
  border: 1rpx solid #ebeef5;
  padding: 28rpx 32rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.02);
}

.points-row {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  color: #e6a23c;
}

.unit-points {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.1;
}

.unit-text {
  font-size: 24rpx;
  color: #909399;
}

.detail-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #303133;
  margin: 16rpx 0 12rpx;
  line-height: 1.4;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24rpx;
  color: #909399;
}

.stock-info {
  color: #606266;
}

.stock-val {
  font-weight: 600;
  color: #303133;
}

.tag-pill {
  font-size: 22rpx;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 20rpx;
  padding: 4rpx 16rpx;
}

.gift-desc {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f2f6fc;
  font-size: 24rpx;
  color: #606266;
  line-height: 1.5;
}

.stepper-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

.stepper-sub {
  font-size: 22rpx;
  color: #909399;
  margin-top: 4rpx;
}

.stepper-box {
  display: inline-flex;
  align-items: center;
  border: 1rpx solid #dcdfe6;
  border-radius: 8rpx;
  overflow: hidden;
  background: #ffffff;
}

.step-btn {
  width: 64rpx;
  height: 64rpx;
  line-height: 60rpx;
  background: #f5f7fa;
  border: none;
  font-size: 32rpx;
  font-weight: bold;
  color: #606266;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}

.step-btn[disabled] {
  color: #c0c4cc;
}

.step-val {
  width: 80rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

.balance-calc-bar {
  background: #f8fafc;
  border-radius: 8rpx;
  padding: 16rpx 24rpx;
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #606266;
  display: flex;
  justify-content: space-between;
}

.font-bold {
  font-weight: 600;
}

.text-success {
  color: #67c23a;
}

.text-danger {
  color: #f56c6c;
}

.notice-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.tag-auto {
  font-size: 20rpx;
  color: #67c23a;
  background-color: #f0f9eb;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
}

.delivery-form {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.form-row {
  display: flex;
  align-items: center;
  background: #f8fafc;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  border: 1rpx solid #ebeef5;
}

.form-label {
  width: 160rpx;
  font-size: 24rpx;
  color: #606266;
  font-weight: 500;
}

.form-input {
  flex: 1;
  font-size: 26rpx;
  color: #303133;
}

.notice-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  font-size: 24rpx;
  color: #606266;
  line-height: 1.6;
}

.item-bold {
  font-weight: 600;
  color: #303133;
}

.fixed-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #ffffff;
  padding: 16rpx 32rpx;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1rpx solid #ebeef5;
  z-index: 100;
}

.cost-summary {
  display: flex;
  flex-direction: column;
}

.cost-label {
  font-size: 22rpx;
  color: #909399;
}

.cost-number {
  font-size: 36rpx;
  font-weight: 700;
  color: #e6a23c;
}

.cost-unit {
  font-size: 24rpx;
  font-weight: normal;
  color: #909399;
}

.exchange-submit-btn {
  background-color: #409eff;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  border-radius: 40rpx;
  padding: 0 44rpx;
  height: 80rpx;
  line-height: 80rpx;
  border: none;
}

.exchange-submit-btn[disabled] {
  background-color: #c0c4cc;
  color: #ffffff;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}

.modal-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 48rpx 40rpx 40rpx;
  width: 100%;
  max-width: 600rpx;
  text-align: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
}

.success-icon-box {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: #f0f9eb;
  color: #67c23a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.success-icon {
  font-size: 48rpx;
  font-weight: bold;
}

.success-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 8rpx;
}

.success-sub {
  font-size: 24rpx;
  color: #909399;
  line-height: 1.4;
}

.pickup-code-display {
  font-family: monospace;
  font-size: 48rpx;
  letter-spacing: 6rpx;
  font-weight: 700;
  color: #409eff;
  background: #ecf5ff;
  border: 2rpx dashed #b3d8ff;
  border-radius: 8rpx;
  padding: 20rpx;
  margin: 28rpx 0 20rpx;
}

.mock-barcode {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 64rpx;
  padding: 12rpx;
  background: #fafafa;
  border: 1rpx solid #ebeef5;
  border-radius: 8rpx;
  margin-bottom: 32rpx;
}

.bar {
  height: 100%;
  background: #1e293b;
}

.w-1 { width: 2rpx; }
.w-2 { width: 4rpx; }
.w-3 { width: 6rpx; }
.w-4 { width: 8rpx; }
.w-5 { width: 10rpx; }
.ml-1 { margin-left: 2rpx; }
.ml-2 { margin-left: 4rpx; }
.ml-3 { margin-left: 6rpx; }
.ml-4 { margin-left: 8rpx; }

.modal-btns {
  display: flex;
  gap: 16rpx;
}

.modal-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
  border-radius: 36rpx;
}

.modal-btn.outline {
  background: #f5f7fa;
  color: #606266;
  border: 1rpx solid #dcdfe6;
}

.modal-btn.primary {
  background: #409eff;
  color: #ffffff;
  border: none;
}
</style>
