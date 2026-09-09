<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import { getStudentProfileApi, updateStudentProfileApi } from '@/api/auth'
import { getMyOrdersApi } from '@/api/gift'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

// 待提货核销订单数量（动态统计）
const pendingOrdersCount = ref(0)

// 编辑资料弹窗状态与表单
const showEditModal = ref(false)
const savingProfile = ref(false)
const formName = ref('')
const formPhone = ref('')
const formGender = ref(1)

// 首字头像徽章
const avatarChar = computed(() => {
  if (userInfo.value && userInfo.value.name && userInfo.value.name !== '未登录') {
    return userInfo.value.name.charAt(0)
  }
  return '学'
})

// 刷新最新学生档案与待提货订单统计
const refreshProfile = async () => {
  if (!userStore.isLoggedIn) return
  try {
    const profile = await getStudentProfileApi()
    if (profile) {
      userStore.setUserInfo(profile)
    }
  } catch (err) {
    // 忽略刷新非阻塞错误
  }

  // 动态同步真实待提货（状态 1-待提货）订单数量
  try {
    const ordersRes = await getMyOrdersApi({ page: 1, size: 1, status: 1 })
    pendingOrdersCount.value = ordersRes?.total ?? 0
  } catch (err) {
    pendingOrdersCount.value = 0
  }
}

onShow(() => {
  refreshProfile()
})

// 登录跳转
const handleUserCardClick = () => {
  if (!userStore.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
  }
}

// 打开个人资料修改弹窗
const openEditModal = () => {
  if (!userStore.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
  formName.value = userInfo.value.name || ''
  formPhone.value = userInfo.value.phone || ''
  formGender.value = userInfo.value.gender ?? 1
  showEditModal.value = true
}

const closeEditModal = () => {
  showEditModal.value = false
}

// 提交个人资料修改
const handleSaveProfile = async () => {
  const nameTrimmed = formName.value.trim()
  const phoneTrimmed = formPhone.value.trim()

  if (!nameTrimmed) {
    uni.showToast({ title: '姓名/昵称不能为空', icon: 'none' })
    return
  }
  if (!phoneTrimmed) {
    uni.showToast({ title: '联系电话不能为空', icon: 'none' })
    return
  }
  if (!/^1[3-9]\d{9}$/.test(phoneTrimmed)) {
    uni.showToast({ title: '请输入有效的11位手机号', icon: 'none' })
    return
  }

  savingProfile.value = true
  try {
    const updated = await updateStudentProfileApi({
      name: nameTrimmed,
      phone: phoneTrimmed,
      gender: formGender.value
    })
    // 同步更新全局 Pinia 与 Storage
    userStore.setUserInfo({
      name: updated.name || nameTrimmed,
      phone: updated.phone || phoneTrimmed,
      gender: updated.gender ?? formGender.value
    })
    uni.showToast({ title: '个人资料保存成功', icon: 'success' })
    showEditModal.value = false
  } catch (err: any) {
    uni.showToast({ title: err.message || '保存失败，请稍后重试', icon: 'none' })
  } finally {
    savingProfile.value = false
  }
}

// 安全说明弹窗
const showSecurityNotice = () => {
  uni.showModal({
    title: '安全认证与令牌隔离说明',
    content: '当前学生端采用独立专属 Student Token 与后端微服务交互，与管理员端物理隔离，保障学籍档案、学分资产与兑换隐私绝对安全。',
    showCancel: false,
    confirmText: '我知道了'
  })
}

// 退出登录
const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确认退出当前学籍账号吗？',
    confirmText: '退出',
    cancelText: '取消',
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

// 页面导航安全封装
const navTo = (url: string) => {
  if (['/pages/activity/index', '/pages/gift/index', '/pages/rank/index', '/pages/my/index'].includes(url)) {
    uni.switchTab({ url })
  } else {
    uni.navigateTo({ url })
  }
}
</script>

<template>
  <view class="my-page">
    <!-- 顶部学生主卡片 (深蓝旗舰渐变) -->
    <view class="my-hero-card" @click="handleUserCardClick">
      <view class="user-profile-row">
        <!-- 头像区 -->
        <view class="profile-avatar-box">
          <image
            v-if="userInfo.avatar"
            class="avatar-img"
            :src="userInfo.avatar"
            mode="aspectFill"
          />
          <view v-else class="profile-avatar-letter">
            {{ avatarChar }}
          </view>
        </view>

        <!-- 学籍信息区 -->
        <view class="user-meta-box">
          <view class="name-line">
            <text class="user-name">{{ userInfo.name || '点击登录 / 认证学籍' }}</text>
            <text v-if="userStore.isLoggedIn" class="badge-certified">学籍已认证</text>
          </view>
          <view class="user-sub-line">
            {{ userInfo.studentNo ? `学号：${userInfo.studentNo}` : '登录后查看学籍与学分' }}
            <text v-if="userInfo.college"> · {{ userInfo.college }}</text>
          </view>
          <view v-if="userInfo.className || userInfo.major" class="user-class-line">
            {{ userInfo.major || '' }} {{ userInfo.className || '' }}
          </view>
        </view>

        <!-- 编辑资料按钮 -->
        <view v-if="userStore.isLoggedIn" class="edit-profile-btn" @click.stop="openEditModal">
          <text>编辑资料</text>
        </view>
      </view>
    </view>

    <!-- 双积分浮动卡片 -->
    <view class="dual-points-card">
      <view class="point-box cur" @click="navTo('/pages/my/points')">
        <text class="point-box-title">可用积分 (current)</text>
        <text class="point-box-val">{{ userInfo.currentPoints }}</text>
        <text class="point-box-sub">用于礼品兑换抵扣 &gt;</text>
      </view>

      <view class="point-box tot" @click="navTo('/pages/rank/index')">
        <text class="point-box-title">累计总学分 (total)</text>
        <text class="point-box-val">{{ userInfo.totalPoints }}</text>
        <text class="point-box-sub">全校学分光荣榜 &gt;</text>
      </view>
    </view>

    <!-- 四宫格入口金刚区 -->
    <view class="grid-action-menu">
      <view class="grid-slot" @click="navTo('/pages/activity/records')">
        <view class="grid-icon-round icon-activity">
          <svg class="grid-svg" viewBox="0 0 24 24">
            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
          </svg>
        </view>
        <text class="slot-text">我的活动</text>
      </view>

      <view class="grid-slot" @click="navTo('/pages/my/orders')">
        <view class="grid-icon-round icon-orders">
          <svg class="grid-svg" viewBox="0 0 24 24">
            <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19M7,7V9H17V7H7M7,11V13H17V11H7M7,15V17H14V15H7Z"/>
          </svg>
          <view v-if="pendingOrdersCount > 0" class="badge-dot">{{ pendingOrdersCount }}</view>
        </view>
        <text class="slot-text">兑换订单</text>
      </view>

      <view class="grid-slot" @click="navTo('/pages/my/points')">
        <view class="grid-icon-round icon-points">
          <svg class="grid-svg" viewBox="0 0 24 24">
            <path d="M21,18V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V6H12C10.89,6 10,6.9 10,8V16C10,17.1 10.89,18 12,18H21M12,16H22V8H12V16M16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5Z"/>
          </svg>
        </view>
        <text class="slot-text">学分流水</text>
      </view>

      <view class="grid-slot" @click="openEditModal">
        <view class="grid-icon-round icon-profile">
          <svg class="grid-svg" viewBox="0 0 24 24">
            <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/>
          </svg>
        </view>
        <text class="slot-text">资料设置</text>
      </view>
    </view>

    <!-- 功能列表项 -->
    <view class="cell-menu-list">
      <view class="cell-menu-item" @click="openEditModal">
        <view class="cell-left-part">
          <svg class="cell-svg" viewBox="0 0 24 24">
            <path d="M17,19H7V5H17M17,1H7C5.89,1 5,1.89 5,3V21A2,2 0 0,0 7,23H17A2,2 0 0,0 19,21V3C19,1.89 18.1,1 17,1Z"/>
          </svg>
          <text class="cell-title">学籍档案与联系电话</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-text">{{ userInfo.phone || '去完善电话' }}</text>
          <text class="cell-arrow">&gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/my/orders')">
        <view class="cell-left-part">
          <svg class="cell-svg" viewBox="0 0 24 24">
            <path d="M22 10V6C22 4.89 21.1 4 20 4H4C2.9 4 2 4.89 2 6V10C3.11 10 4 10.9 4 12S3.11 14 2 14V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V14C20.9 14 20 13.1 20 12S20.9 10 22 10M20 8.54C18.81 9.23 18 10.53 18 12S18.81 14.77 20 15.46V18H4V15.46C5.19 14.77 6 13.47 6 12S5.19 9.23 4 8.54V6H20V8.54Z"/>
          </svg>
          <text class="cell-title">现场提货核销凭证</text>
        </view>
        <view class="cell-right-part">
          <text v-if="pendingOrdersCount > 0" class="cell-sub-warning">{{ pendingOrdersCount }} 件待提货 &gt;</text>
          <text v-else class="cell-sub-text">暂无待提货 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/rank/index')">
        <view class="cell-left-part">
          <svg class="cell-svg" viewBox="0 0 24 24">
            <path d="M19 5H18V3H6V5H5C3.9 5 3 5.9 3 7V8C3 10.55 4.92 12.63 7.39 12.93C8.15 14.25 9.47 15.19 11 15.46V18H8V20H16V18H13V15.46C14.53 15.19 15.85 14.25 16.61 12.93C19.08 12.63 21 10.55 21 8V7C21 5.9 20.1 5 19 5M5 8V7H6V10.7C5.38 10.21 5 9.46 5 8M19 8C19 9.46 18.62 10.21 18 10.7V7H19V8Z"/>
          </svg>
          <text class="cell-title">全校学分荣誉排行榜</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-text">查看排名 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="showSecurityNotice">
        <view class="cell-left-part">
          <svg class="cell-svg" viewBox="0 0 24 24">
            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,11.99H19C18.47,16.11 15.72,19.78 12,20.93V12H5V6.3L12,3.19V11.99Z"/>
          </svg>
          <text class="cell-title">安全认证与令牌隔离</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-success">已受保护 &gt;</text>
        </view>
      </view>
    </view>

    <!-- 退出登录按钮 -->
    <view v-if="userStore.isLoggedIn" class="logout-wrap">
      <button class="logout-btn" @click="handleLogout">退出当前学籍账号</button>
    </view>

    <!-- 编辑个人资料模态弹窗 -->
    <view v-if="showEditModal" class="modal-backdrop" @click="closeEditModal">
      <view class="modal-card" @click.stop>
        <view class="modal-header">
          <text class="modal-title">完善个人资料与学籍档案</text>
          <text class="modal-close" @click="closeEditModal">×</text>
        </view>

        <view class="modal-body">
          <!-- 只读学籍信息 -->
          <view class="form-item readonly">
            <text class="form-label">学号 (唯一认证)</text>
            <view class="form-val-readonly">{{ userInfo.studentNo }}</view>
          </view>
          <view class="form-item readonly">
            <text class="form-label">院系班级</text>
            <view class="form-val-readonly">
              {{ userInfo.college || '未绑定学院' }} · {{ userInfo.className || '未绑定班级' }}
            </view>
          </view>

          <!-- 可编辑信息 -->
          <view class="form-item">
            <text class="form-label">姓名 / 昵称 <text class="required">*</text></text>
            <input
              class="form-input"
              v-model="formName"
              placeholder="请输入姓名或昵称"
              maxlength="20"
            />
          </view>

          <view class="form-item">
            <text class="form-label">联系电话 (用于提货与通知) <text class="required">*</text></text>
            <input
              class="form-input"
              v-model="formPhone"
              type="number"
              placeholder="请输入11位手机号"
              maxlength="11"
            />
          </view>

          <view class="form-item">
            <text class="form-label">性别</text>
            <view class="gender-radio-group">
              <view
                :class="['radio-pill', formGender === 1 ? 'active' : '']"
                @click="formGender = 1"
              >
                👨 男生
              </view>
              <view
                :class="['radio-pill', formGender === 2 ? 'active' : '']"
                @click="formGender = 2"
              >
                👩 女生
              </view>
            </view>
          </view>
        </view>

        <view class="modal-footer">
          <button class="modal-cancel-btn" @click="closeEditModal">取消</button>
          <button
            class="modal-submit-btn"
            :loading="savingProfile"
            :disabled="savingProfile"
            @click="handleSaveProfile"
          >
            保存修改
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.my-page {
  min-height: 100vh;
  background-color: #f8fafc;
  padding-bottom: 80rpx;
}

/* 顶部学生卡片 (深蓝旗舰渐变) */
.my-hero-card {
  background: linear-gradient(135deg, #1e3a8a 0%, #172554 100%);
  color: #ffffff;
  padding: 40rpx 32rpx 70rpx 32rpx;
  position: relative;
}

.user-profile-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.profile-avatar-box {
  flex-shrink: 0;
}

.profile-avatar-letter {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50rpx;
  background: #ffffff;
  color: #1e3a8a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 700;
  border: 4rpx solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.2);
}

.avatar-img {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.5);
}

.user-meta-box {
  flex: 1;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.user-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #ffffff;
}

.badge-certified {
  font-size: 20rpx;
  background-color: #10b981;
  color: #ffffff;
  padding: 2rpx 12rpx;
  border-radius: 20rpx;
  font-weight: 500;
}

.user-sub-line {
  font-size: 24rpx;
  color: #cbd5e1;
  margin-top: 8rpx;
}

.user-class-line {
  font-size: 22rpx;
  color: #94a3b8;
  margin-top: 4rpx;
}

.edit-profile-btn {
  padding: 8rpx 18rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.4);
  border-radius: 28rpx;
  font-size: 22rpx;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

/* 双积分对比大卡片 */
.dual-points-card {
  margin: -40rpx 32rpx 24rpx 32rpx;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
  border: 1rpx solid #e2e8f0;
  position: relative;
  z-index: 10;
}

.point-box {
  border-radius: 12rpx;
  padding: 18rpx 20rpx;
  display: flex;
  flex-direction: column;
}

.point-box.cur {
  background: #eff6ff;
  border: 1rpx solid #bfdbfe;
}

.point-box.tot {
  background: #faf5ff;
  border: 1rpx solid #e9d5ff;
}

.point-box-title {
  font-size: 22rpx;
  font-weight: 500;
}

.point-box.cur .point-box-title {
  color: #2563eb;
}

.point-box.tot .point-box-title {
  color: #7e22ce;
}

.point-box-val {
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.2;
  margin: 6rpx 0;
}

.point-box.cur .point-box-val {
  color: #1d4ed8;
}

.point-box.tot .point-box-val {
  color: #6b21a8;
}

.point-box-sub {
  font-size: 20rpx;
  color: #64748b;
}

/* 四宫格入口金刚区 */
.grid-action-menu {
  margin: 0 32rpx 24rpx 32rpx;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 28rpx 16rpx;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  border: 1rpx solid #e2e8f0;
}

.grid-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.grid-icon-round {
  width: 84rpx;
  height: 84rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.badge-dot {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 20rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  border-radius: 16rpx;
  text-align: center;
  padding: 0 6rpx;
  font-weight: 700;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.2);
}

.icon-activity {
  background: #eff6ff;
}

.icon-orders {
  background: #fef3c7;
}

.icon-points {
  background: #faf5ff;
}

.icon-profile {
  background: #ecfdf5;
}

.action-icon {
  font-size: 40rpx;
}

.grid-svg {
  width: 44rpx;
  height: 44rpx;
}

.icon-activity .grid-svg {
  fill: #2563eb;
}

.icon-orders .grid-svg {
  fill: #d97706;
}

.icon-points .grid-svg {
  fill: #7e22ce;
}

.icon-profile .grid-svg {
  fill: #059669;
}

.cell-svg {
  width: 38rpx;
  height: 38rpx;
  fill: #64748b;
  flex-shrink: 0;
  margin-right: 12rpx;
}

.slot-text {
  font-size: 24rpx;
  font-weight: 500;
  color: #334155;
}

/* 列表菜单 */
.cell-menu-list {
  margin: 0 32rpx 40rpx 32rpx;
  background: #ffffff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  border: 1rpx solid #e2e8f0;
}

.cell-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.cell-menu-item:last-child {
  border-bottom: none;
}

.cell-left-part {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.cell-icon {
  font-size: 32rpx;
}

.cell-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #1e293b;
}

.cell-right-part {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.cell-sub-text {
  font-size: 24rpx;
  color: #64748b;
}

.cell-sub-warning {
  font-size: 24rpx;
  color: #f59e0b;
  font-weight: 500;
}

.cell-sub-success {
  font-size: 24rpx;
  color: #10b981;
}

.cell-arrow {
  font-size: 24rpx;
  color: #94a3b8;
}

/* 退出登录按钮 */
.logout-wrap {
  margin: 0 32rpx;
}

.logout-btn {
  background: #ffffff;
  color: #ef4444;
  border: 1rpx solid #fecaca;
  border-radius: 40rpx;
  font-size: 28rpx;
  font-weight: 500;
  height: 84rpx;
  line-height: 84rpx;
}

/* 资料修改模态弹窗 */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 40rpx;
}

.modal-card {
  width: 100%;
  max-width: 640rpx;
  background: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.modal-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0f172a;
}

.modal-close {
  font-size: 40rpx;
  color: #94a3b8;
  padding: 0 10rpx;
  line-height: 1;
}

.modal-body {
  padding: 30rpx;
  max-height: 70vh;
  overflow-y: auto;
}

.form-item {
  margin-bottom: 24rpx;
}

.form-item.readonly {
  background: #f8fafc;
  padding: 16rpx;
  border-radius: 10rpx;
  border: 1rpx dashed #cbd5e1;
}

.form-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10rpx;
}

.required {
  color: #ef4444;
}

.form-val-readonly {
  font-size: 26rpx;
  color: #64748b;
}

.form-input {
  width: 100%;
  height: 76rpx;
  background: #f8fafc;
  border: 1rpx solid #cbd5e1;
  border-radius: 10rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #0f172a;
  box-sizing: border-box;
}

.gender-radio-group {
  display: flex;
  gap: 20rpx;
}

.radio-pill {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  background: #f1f5f9;
  border: 1rpx solid #cbd5e1;
  border-radius: 10rpx;
  font-size: 26rpx;
  color: #475569;
}

.radio-pill.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 600;
}

.modal-footer {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 30rpx 30rpx 30rpx;
  border-top: 1rpx solid #f1f5f9;
}

.modal-cancel-btn {
  flex: 1;
  background: #f1f5f9;
  color: #64748b;
  font-size: 26rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 12rpx;
}

.modal-submit-btn {
  flex: 1;
  background: #2563eb;
  color: #ffffff;
  font-size: 26rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 12rpx;
}
</style>
