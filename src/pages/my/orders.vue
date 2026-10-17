<script setup lang="ts">
import { ref, computed } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import {
  getMyOrdersApi,
  cancelMyOrderApi,
  type StudentGiftOrder
} from '@/api/gift'
import { resolveImageUrl } from '@/utils/image'

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
    confirmColor: '#ef4444',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await cancelMyOrderApi(order.id)
        // 核心修复：仅返还用户可用积分(currentPoints)，严禁虚增历史总积分(totalPoints)
        userStore.refundPoints(order.pointsCost)
        uni.showToast({
          title: `订单已取消，+${order.pointsCost} 积分已原路退回！`,
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
        已核销
      </view>
      <view
        :class="['tab-btn', currentTab === 3 ? 'active' : '']"
        @click="handleTabChange(3)"
      >
        已取消
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
              :src="resolveImageUrl(order.giftImage)"
              mode="aspectFill"
              class="thumb-img"
            />
            <app-icon v-else name="gift" :size="48" color="#cbd5e1" stroke-width="1.6" />
          </view>
          <view class="order-meta">
            <view class="gift-title">{{ order.giftName || '校园礼品' }}</view>
            <view class="order-sub">
              数量：{{ order.quantity }} 件 · 下单时间：{{ order.createTime }}
            </view>
            <view class="points-cost-txt" :class="{ refunded: order.status === 3 }">
              {{ order.status === 3 ? `已退回 +${order.pointsCost}` : `-${order.pointsCost}` }}
              <text class="pts-unit">积分</text>
            </view>
          </view>
        </view>

        <!-- 履约核销备注或退单原因说明 -->
        <view v-if="order.status === 2 && order.remark" class="fulfillment-info-box">
          <app-icon name="file-text" :size="24" color="#10b981" />
          <text class="info-label">签收备注：</text>
          <text class="info-content">{{ order.remark }}</text>
        </view>
        <view v-else-if="order.status === 3 && order.cancelReason" class="fulfillment-info-box cancel">
          <app-icon name="alert-circle" :size="24" color="#ef4444" />
          <text class="info-label">退单原因：</text>
          <text class="info-content">{{ order.cancelReason }}</text>
        </view>

        <view class="order-card-bottom">
          <!-- 非待提货状态的提货码已失效，置灰避免被拿去现场出示 -->
          <view class="code-area" :class="{ invalid: order.status !== 1 }">
            <text class="code-label">{{ order.status === 1 ? '提货码：' : '提货码（已失效）：' }}</text>
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
            <template v-else-if="order.status === 2">
              <text class="archived-txt success">
                已核销提货 {{ order.deliveryTime ? '· ' + order.deliveryTime : '' }}
              </text>
            </template>
            <template v-else>
              <text class="archived-txt">订单已关闭</text>
            </template>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <app-empty
        v-if="!loading && orderList.length === 0"
        icon="package"
        title="暂无兑换订单"
        desc="去积分商城逛逛，用积分换一份校园纪念品"
      />
    </view>

    <!-- 提货凭证模态框 (出示给管理员核销) -->
    <view v-if="showCodeModal" class="modal-mask" @click="closeCodeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-icon-box">
          <app-icon name="ticket" :size="72" color="#2563eb" stroke-width="1.6" />
        </view>
        <view class="modal-title">现场提货核销凭证</view>
        <view class="modal-sub">请将下方提货码出示给现场管理员核验核销</view>

        <view class="big-pickup-code">{{ activePickupCode }}</view>

        <view class="modal-loc-info">
          <view>• <text class="font-bold">提货地点：</text>大学生活动中心 102 创客中心</view>
          <view>• <text class="font-bold">开放时间：</text>周一至周五 09:00 - 17:30</view>
          <view>• <text class="font-bold">提货时效：</text>自提保留 24 小时（1天），逾期系统自动关单退分</view>
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
  border-bottom: 1rpx solid #e2e8f0;
  gap: 16rpx;
}

.tab-btn {
  font-size: 24rpx;
  font-weight: 500;
  color: #475569;
  padding: 8rpx 24rpx;
  border-radius: 28rpx;
  border: 1rpx solid #e2e8f0;
  background: #f8fafc;
}

.tab-btn.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
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
  border: 1rpx solid #e2e8f0;
}

.order-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 22rpx;
  color: #64748b;
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
  background: #fffbeb;
  color: #f59e0b;
  border: 1rpx solid #f5dab1;
}

.status-tag.success {
  background: #ecfdf5;
  color: #10b981;
  border: 1rpx solid #e1f3d8;
}

.status-tag.info {
  background: #f4f4f5;
  color: #64748b;
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
  border: 1rpx solid #e2e8f0;
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
  color: #1e293b;
  font-size: 26rpx;
  line-height: 1.4;
}

.order-sub {
  font-size: 22rpx;
  color: #64748b;
  margin-top: 6rpx;
}

.code-area.invalid .code-badge {
  color: #94a3b8;
  background: #f1f5f9;
  border-color: #e2e8f0;
  text-decoration: line-through;
}
.code-area.invalid .code-label {
  color: #94a3b8;
}
.points-cost-txt {
  font-size: 28rpx;
  font-weight: 700;
  color: #f59e0b;
  margin-top: 8rpx;
}
.points-cost-txt.refunded {
  color: #10b981;
}

.pts-unit {
  font-size: 22rpx;
  color: #64748b;
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
  color: #64748b;
}

.code-badge {
  font-family: monospace;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
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
  border: 1rpx solid #e2e8f0;
  color: #475569;
}

.card-btn.outline.text-danger {
  color: #ef4444;
  border-color: #fde2e2;
}

.card-btn.primary {
  background: #2563eb;
  color: #ffffff;
  border: none;
}

.archived-txt {
  font-size: 22rpx;
  color: #cbd5e1;
}

.archived-txt.success {
  color: #10b981;
  font-weight: 500;
}

.fulfillment-info-box {
  background: #ecfdf5;
  border: 1rpx solid #e1f3d8;
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  margin-bottom: 16rpx;
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  font-size: 22rpx;
}

.fulfillment-info-box.cancel {
  background: #fef2f2;
  border-color: #fde2e2;
}

.fulfillment-info-box .info-tag-icon {
  font-size: 24rpx;
  line-height: 1.3;
}

.fulfillment-info-box .info-label {
  font-weight: 600;
  color: #10b981;
  flex-shrink: 0;
  line-height: 1.4;
}

.fulfillment-info-box.cancel .info-label {
  color: #ef4444;
}

.fulfillment-info-box .info-content {
  color: #475569;
  flex: 1;
  word-break: break-all;
  line-height: 1.4;
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
  background: #eff6ff;
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
  color: #1e293b;
}

.modal-sub {
  font-size: 22rpx;
  color: #64748b;
  margin-top: 6rpx;
}

.big-pickup-code {
  font-family: monospace;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 6rpx;
  color: #2563eb;
  margin: 24rpx 0 28rpx;
  padding: 16rpx;
  background: #eff6ff;
  border: 2rpx dashed #b3d8ff;
  border-radius: 8rpx;
}

.modal-loc-info {
  background: #f8fafc;
  border-radius: 8rpx;
  padding: 16rpx 20rpx;
  font-size: 22rpx;
  color: #475569;
  text-align: left;
  margin-bottom: 28rpx;
  line-height: 1.6;
}

.font-bold {
  font-weight: 600;
  color: #1e293b;
}

.modal-close-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  background: #2563eb;
  color: #ffffff;
  font-size: 26rpx;
  border: none;
}
</style>
