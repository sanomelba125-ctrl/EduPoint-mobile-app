<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import {
  getMyOrdersApi,
  cancelMyOrderApi,
  type StudentGiftOrder
} from '@/api/gift'

const userStore = useUserStore()

const currentTab = ref<number | undefined>(undefined) // undefined = 全部, 1 = 待提货, 2 = 已核销, 3 = 已取消
const loading = ref(false)
const orderList = ref<StudentGiftOrder[]>([])

// 提货码大字出示弹窗
const showCodeModal = ref(false)
const activePickupCode = ref('')

const fetchOrders = async () => {
  loading.value = true
  try {
    const res = await getMyOrdersApi({
      page: 1,
      size: 50,
      status: currentTab.value
    })
    const list = res?.records || (Array.isArray(res) ? res : [])
    orderList.value = list
  } catch (err: any) {
    uni.showToast({ title: err.message || '获取订单失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const handleTabChange = (statusVal: number | undefined) => {
  currentTab.value = statusVal
  fetchOrders()
}

const openCodeModal = (code: string) => {
  activePickupCode.value = code
  showCodeModal.value = true
}

const closeCodeModal = () => {
  showCodeModal.value = false
}

const handleCancelOrder = (order: StudentGiftOrder) => {
  uni.showModal({
    title: '确认取消订单',
    content: `取消后该笔兑换订单将作废，扣减的 ${order.pointsCost} 积分将原路返还至您的账户。\n\n确认退订吗？`,
    confirmText: '确认退订',
    cancelText: '再想想',
    confirmColor: '#f56c6c',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await cancelMyOrderApi(order.id)
        // 核心亮点：全局更新 Pinia 中的用户可用积分，实时返还
        userStore.updatePoints(order.pointsCost)
        uni.showToast({
          title: `订单已取消，+${order.pointsCost} pts 已原路退回！`,
          icon: 'none'
        })
        fetchOrders()
      } catch (err: any) {
        uni.showToast({ title: err.message || '取消订单失败', icon: 'none' })
      }
    }
  })
}

onPullDownRefresh(() => {
  fetchOrders()
})

onShow(() => {
  fetchOrders()
})

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <view class="my-orders-page">
    <!-- 状态切换 Tab 横条 -->
    <view class="tab-strip">
      <view
        :class="['tab-btn', currentTab === undefined ? 'active' : '']"
        @click="handleTabChange(undefined)"
      >
        全部
      </view>
      <view
        :class="['tab-btn', currentTab === 1 ? 'active' : '']"
        @click="handleTabChange(1)"
      >
        待提货
      </view>
      <view
        :class="['tab-btn', currentTab === 2 ? 'active' : '']"
        @click="handleTabChange(2)"
      >
        已领取
      </view>
      <view
        :class="['tab-btn', currentTab === 3 ? 'active' : '']"
        @click="handleTabChange(3)"
      >
        已退单
      </view>
    </view>

    <!-- 订单列表 -->
    <view class="orders-wrap">
      <view
        v-for="order in orderList"
        :key="order.id"
        class="order-card"
      >
        <view class="order-card-top">
          <text class="order-no">订单号：{{ order.orderNo }}</text>
          <view
            :class="[
              'status-tag',
              order.status === 1
                ? 'warning'
                : order.status === 2
                ? 'success'
                : 'info'
            ]"
          >
            {{
              order.status === 1
                ? '待现场提货'
                : order.status === 2
                ? '已核销提货'
                : '已取消 / 积分已返还'
            }}
          </view>
        </view>

        <view class="order-card-middle">
          <view class="thumb-box">
            <image
              v-if="order.giftImage"
              :src="order.giftImage"
              mode="aspectFill"
              class="thumb-img"
            />
            <text v-else class="thumb-icon">🎁</text>
          </view>
          <view class="order-meta">
            <view class="gift-title">{{ order.giftName || '校园礼品' }}</view>
            <view class="order-sub">
              数量：{{ order.quantity }} 件 · 下单时间：{{ order.createTime }}
            </view>
            <view class="points-cost-txt">
              -{{ order.pointsCost }} <text class="pts-unit">pts</text>
            </view>
          </view>
        </view>

        <view class="order-card-bottom">
          <view class="code-area">
            <text class="code-label">提货码：</text>
            <text class="code-badge">{{ order.pickupCode }}</text>
          </view>

          <view class="action-buttons">
            <template v-if="order.status === 1">
              <button class="card-btn outline text-danger" @click="handleCancelOrder(order)">
                取消订单
              </button>
              <button class="card-btn primary" @click="openCodeModal(order.pickupCode)">
                出示提货码
              </button>
            </template>
            <template v-else>
              <text class="archived-txt">流水归档完成</text>
            </template>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && orderList.length === 0" class="empty-box">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无对应兑换订单记录</text>
      </view>
    </view>

    <!-- 提货凭证模态框 (出示给管理员核销) -->
    <view v-if="showCodeModal" class="modal-mask" @click="closeCodeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-icon-box">
          <text class="modal-icon">🎫</text>
        </view>
        <view class="modal-title">现场提货核销凭证</view>
        <view class="modal-sub">请将下方提货码出示给现场管理员扫码核销</view>

        <view class="big-pickup-code">{{ activePickupCode }}</view>

        <!-- 模拟条码 -->
        <view class="mock-barcode-bar">
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
        </view>

        <view class="modal-loc-info">
          <view>• <text class="font-bold">提货地点：</text>大学生活动中心 102 创客中心</view>
          <view>• <text class="font-bold">开放时间：</text>周一至周五 09:00 - 17:30</view>
        </view>

        <button class="modal-close-btn" @click="closeCodeModal">
          完成出示
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.my-orders-page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding-bottom: 40rpx;
}

.tab-strip {
  display: flex;
  background: #ffffff;
  padding: 16rpx 32rpx;
  border-bottom: 1rpx solid #ebeef5;
  gap: 16rpx;
}

.tab-btn {
  font-size: 24rpx;
  font-weight: 500;
  color: #606266;
  padding: 8rpx 24rpx;
  border-radius: 28rpx;
  border: 1rpx solid #e4e7ed;
  background: #f8fafc;
}

.tab-btn.active {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

.orders-wrap {
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.order-card {
  background: #ffffff;
  border-radius: 12rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.02);
  border: 1rpx solid #ebeef5;
}

.order-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 22rpx;
  color: #909399;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f2f6fc;
}

.order-no {
  font-family: monospace;
}

.status-tag {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 16rpx;
}

.status-tag.warning {
  background: #fdf6ec;
  color: #e6a23c;
  border: 1rpx solid #f5dab1;
}

.status-tag.success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1rpx solid #e1f3d8;
}

.status-tag.info {
  background: #f4f4f5;
  color: #909399;
  border: 1rpx solid #e9e9eb;
}

.order-card-middle {
  display: flex;
  gap: 20rpx;
  margin: 20rpx 0;
}

.thumb-box {
  width: 108rpx;
  height: 108rpx;
  background: #f8fafc;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1rpx solid #ebeef5;
}

.thumb-img {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.thumb-icon {
  font-size: 52rpx;
}

.order-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.gift-title {
  font-weight: 600;
  color: #303133;
  font-size: 26rpx;
  line-height: 1.4;
}

.order-sub {
  font-size: 22rpx;
  color: #909399;
  margin-top: 6rpx;
}

.points-cost-txt {
  font-size: 28rpx;
  font-weight: 700;
  color: #e6a23c;
  margin-top: 8rpx;
}

.pts-unit {
  font-size: 22rpx;
  color: #909399;
  font-weight: normal;
}

.order-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20rpx;
  border-top: 1rpx solid #f2f6fc;
}

.code-area {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.code-label {
  font-size: 22rpx;
  color: #909399;
}

.code-badge {
  font-family: monospace;
  font-weight: 700;
  color: #409eff;
  background: #ecf5ff;
  border: 1rpx dashed #b3d8ff;
  padding: 4rpx 14rpx;
  border-radius: 6rpx;
  font-size: 24rpx;
  letter-spacing: 1rpx;
}

.action-buttons {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.card-btn {
  height: 56rpx;
  line-height: 54rpx;
  padding: 0 20rpx;
  font-size: 22rpx;
  border-radius: 28rpx;
  margin: 0;
}

.card-btn.outline {
  background: #ffffff;
  border: 1rpx solid #dcdfe6;
  color: #606266;
}

.card-btn.outline.text-danger {
  color: #f56c6c;
  border-color: #fde2e2;
}

.card-btn.primary {
  background: #409eff;
  color: #ffffff;
  border: none;
}

.archived-txt {
  font-size: 22rpx;
  color: #c0c4cc;
}

.empty-box {
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

.modal-content {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 48rpx 40rpx 36rpx;
  width: 100%;
  max-width: 580rpx;
  text-align: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.2);
}

.modal-icon-box {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #ecf5ff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
}

.modal-icon {
  font-size: 40rpx;
}

.modal-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #303133;
}

.modal-sub {
  font-size: 22rpx;
  color: #909399;
  margin-top: 6rpx;
}

.big-pickup-code {
  font-family: monospace;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 6rpx;
  color: #409eff;
  margin: 24rpx 0 16rpx;
  padding: 16rpx;
  background: #ecf5ff;
  border: 2rpx dashed #b3d8ff;
  border-radius: 8rpx;
}

.mock-barcode-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 56rpx;
  padding: 10rpx;
  background: #fafafa;
  border: 1rpx solid #ebeef5;
  border-radius: 8rpx;
  margin-bottom: 24rpx;
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

.modal-loc-info {
  background: #f8fafc;
  border-radius: 8rpx;
  padding: 16rpx 20rpx;
  font-size: 22rpx;
  color: #606266;
  text-align: left;
  margin-bottom: 28rpx;
  line-height: 1.6;
}

.font-bold {
  font-weight: 600;
  color: #303133;
}

.modal-close-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  background: #409eff;
  color: #ffffff;
  font-size: 26rpx;
  border: none;
}
</style>
