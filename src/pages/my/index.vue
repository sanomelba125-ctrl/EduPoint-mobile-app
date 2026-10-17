<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import { storeToRefs } from 'pinia'
import { getStudentProfileApi, updateStudentProfileApi, changeStudentPasswordApi, studentLogoutApi } from '@/api/auth'
import { uploadImageApi } from '@/api/upload'
import { resolveImageUrl } from '@/utils/image'
import { getMyOrdersApi } from '@/api/gift'
import { getUnreadNoticeCountApi } from '@/api/notice'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

// 待提货核销订单数量（动态统计）
const pendingOrdersCount = ref(0)
// 未读系统通知数量
const unreadNoticeCount = ref(0)

// 编辑资料弹窗状态与表单
const showEditModal = ref(false)
const savingProfile = ref(false)
const formName = ref('')
const formPhone = ref('')
const formGender = ref(1)
// 头像：表单中的待提交值 + 上传中状态
const formAvatar = ref('')
const uploadingAvatar = ref(false)

// 首字头像徽章
const avatarChar = computed(() => {
  if (userInfo.value && userInfo.value.name && userInfo.value.name !== '未登录') {
    return userInfo.value.name.charAt(0)
  }
  return '学'
})

// 刷新最新学生档案与待提货订单统计
const refreshProfile = async () => {
  if (!userStore.isLoggedIn) {
    // 退出登录后必须复位角标，否则红点会继续显示上一个账号的数字
    pendingOrdersCount.value = 0
    unreadNoticeCount.value = 0
    return
  }
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

  // 动态同步未读系统通知数量
  try {
    const noticeCount = await getUnreadNoticeCountApi()
    unreadNoticeCount.value = noticeCount || 0
  } catch (err) {
    unreadNoticeCount.value = 0
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
  formAvatar.value = userInfo.value.avatar || ''
  showEditModal.value = true
}

const closeEditModal = () => {
  showEditModal.value = false
}

// 选择本地图片并上传至对象存储，成功后仅更新表单待提交值（点“保存修改”才落库）
const handleChooseAvatar = () => {
  if (uploadingAvatar.value) return

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res: any) => {
      const filePath: string = res.tempFilePaths?.[0]
      const file = res.tempFiles?.[0]
      const size: number | undefined = file?.size
      // H5 端 tempFilePaths 是 blob: 地址（无扩展名），必须用 tempFiles[0].name 判断格式
      const fileName: string | undefined = file?.name
      if (!filePath) return

      uploadingAvatar.value = true
      uni.showLoading({ title: '上传中...', mask: true })
      try {
        const url = await uploadImageApi(filePath, size, fileName)
        uni.hideLoading()
        formAvatar.value = url
        uni.showToast({ title: '头像上传成功', icon: 'success' })
      } catch (err: any) {
        uni.hideLoading()
        uni.showToast({ title: err?.message || '头像上传失败', icon: 'none' })
      } finally {
        uploadingAvatar.value = false
      }
    },
    fail: () => {
      // 用户主动取消选择，无需提示
    }
  })
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
      gender: formGender.value,
      avatar: formAvatar.value
    })
    // 同步更新全局 Pinia 与 Storage
    userStore.setUserInfo({
      name: updated.name || nameTrimmed,
      phone: updated.phone || phoneTrimmed,
      gender: updated.gender ?? formGender.value,
      avatar: updated.avatar || formAvatar.value
    })
    uni.showToast({ title: '个人资料保存成功', icon: 'success' })
    showEditModal.value = false
  } catch (err: any) {
    uni.showToast({ title: err.message || '保存失败，请稍后重试', icon: 'none' })
  } finally {
    savingProfile.value = false
  }
}

// 修改登录密码弹窗状态与表单
const showPasswordModal = ref(false)
const changingPassword = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const openPasswordModal = () => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后再修改密码', icon: 'none' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/index' })
    }, 700)
    return
  }
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showPasswordModal.value = true
}

const closePasswordModal = () => {
  if (changingPassword.value) return
  showPasswordModal.value = false
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

const handlePasswordSubmit = async () => {
  const oldPwd = oldPassword.value.trim()
  const newPwd = newPassword.value.trim()
  const confirmPwd = confirmPassword.value.trim()

  if (!oldPwd) {
    uni.showToast({ title: '请输入原登录密码', icon: 'none' })
    return
  }
  if (!newPwd) {
    uni.showToast({ title: '请输入新密码', icon: 'none' })
    return
  }
  if (newPwd.length < 6) {
    uni.showToast({ title: '新密码不能少于6位', icon: 'none' })
    return
  }
  if (newPwd === oldPwd) {
    uni.showToast({ title: '新密码不能与原密码相同', icon: 'none' })
    return
  }
  if (newPwd !== confirmPwd) {
    uni.showToast({ title: '两次新密码输入不一致', icon: 'none' })
    return
  }

  changingPassword.value = true
  try {
    await changeStudentPasswordApi({
      oldPassword: oldPwd,
      newPassword: newPwd,
      confirmPassword: confirmPwd
    })
    uni.showToast({ title: '密码修改成功，请牢记', icon: 'success' })
    showPasswordModal.value = false
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err: any) {
    uni.showToast({ title: err.message || '修改失败，请重试', icon: 'none' })
  } finally {
    changingPassword.value = false
  }
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
        studentLogoutApi().catch(() => {})
        userStore.logout()
        pendingOrdersCount.value = 0
        unreadNoticeCount.value = 0
        uni.showToast({ title: '已退出登录', icon: 'none' })
        setTimeout(() => {
          uni.navigateTo({ url: '/pages/login/index' })
        }, 500)
      }
    }
  })
}

// 页面导航安全封装
/**
 * 未登录也能自由进入的页面：
 * - 积分商城 / 礼品详情：游客可浏览商品（礼品域免登录）
 * - 排行榜：公开榜单，用于激励非登录用户
 * - 活动大厅：tabBar 首页
 * - 登录页：否则会形成"点入口→跳登录→又被拦"的死循环
 * 其余入口（我的活动、兑换订单、积分流水、通知、证书…）均为个人数据，未登录一律引导登录。
 */
const GUEST_ALLOWED = [
  '/pages/login/index',
  '/pages/activity/index',
  '/pages/gift/index',
  '/pages/gift/detail',
  '/pages/rank/index'
]

const navTo = (url: string) => {
  if (!userStore.isLoggedIn) {
    const allowed = GUEST_ALLOWED.some((p) => url === p || url.startsWith(`${p}?`))
    if (!allowed) {
      uni.showToast({ title: '请先登录后再查看', icon: 'none' })
      setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 700)
      return
    }
  }
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
            :src="resolveImageUrl(userInfo.avatar)"
            mode="aspectFill"
          />
          <!-- 游客态用线性人像图标，避免与已登录用户的首字徽章混淆 -->
          <app-icon v-else-if="!userStore.isLoggedIn" name="graduate" :size="52" color="#1e3a8a" />
          <view v-else class="profile-avatar-letter">
            {{ avatarChar }}
          </view>
        </view>

        <!-- 学籍信息区 -->
        <view class="user-meta-box">
          <view class="name-line">
            <text class="user-name">{{ userStore.isLoggedIn ? userInfo.name : '点击登录 / 认证学籍' }}</text>
            <text v-if="userStore.isLoggedIn" class="badge-certified">学籍已认证</text>
          </view>
          <view class="user-sub-line">
            {{ userInfo.studentNo ? `学号：${userInfo.studentNo}` : '登录后查看学籍与积分' }}
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

    <!-- 双积分浮动卡片（未登录时改为登录引导，避免展示无意义的 0 值误导用户） -->
    <view class="dual-points-card" v-if="userStore.isLoggedIn">
      <view class="point-box cur" @click="navTo('/pages/my/points')">
        <text class="point-box-title">可用积分</text>
        <text class="point-box-val">{{ userInfo.currentPoints }}</text>
        <text class="point-box-sub">用于礼品兑换抵扣 &gt;</text>
      </view>

      <view class="point-box tot" @click="navTo('/pages/rank/index')">
        <text class="point-box-title">累计总积分</text>
        <text class="point-box-val">{{ userInfo.totalPoints }}</text>
        <text class="point-box-sub">全校积分光荣榜 &gt;</text>
      </view>
    </view>

    <view class="login-guide-card" v-else @click="navTo('/pages/login/index')">
      <view class="lg-main">
        <text class="lg-title">登录后查看积分与排名</text>
        <text class="lg-sub">使用学号与统一认证密码登录</text>
      </view>
      <text class="lg-action">立即登录 &gt;</text>
    </view>

    <!-- 四宫格入口金刚区 -->
    <view class="grid-action-menu">
      <view class="grid-slot" @click="navTo('/pages/activity/records')">
        <view class="grid-icon-round icon-activity">
          <app-icon name="calendar" :size="44" />
        </view>
        <text class="slot-text">我的活动</text>
      </view>

      <view class="grid-slot" @click="navTo('/pages/my/orders')">
        <view class="grid-icon-round icon-orders">
          <app-icon name="package" :size="44" />
          <view v-if="pendingOrdersCount > 0" class="badge-dot">{{ pendingOrdersCount }}</view>
        </view>
        <text class="slot-text">兑换订单</text>
      </view>

      <view class="grid-slot" @click="navTo('/pages/my/points')">
        <view class="grid-icon-round icon-points">
          <app-icon name="coins" :size="44" />
        </view>
        <text class="slot-text">积分流水</text>
      </view>

      <view class="grid-slot" @click="openEditModal">
        <view class="grid-icon-round icon-profile">
          <app-icon name="user" :size="44" />
        </view>
        <text class="slot-text">资料设置</text>
      </view>
    </view>

    <!-- 功能列表项 -->
    <view class="cell-menu-list">
      <view class="cell-menu-item" @click="openEditModal">
        <view class="cell-left-part">
          <app-icon name="file-text" :size="38" />
          <text class="cell-title">学籍档案与联系电话</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-text">{{ userInfo.phone || '去完善电话' }}</text>
          <text class="cell-arrow">&gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/my/orders')">
        <view class="cell-left-part">
          <app-icon name="qrcode" :size="38" />
          <text class="cell-title">现场提货核销凭证</text>
        </view>
        <view class="cell-right-part">
          <text v-if="pendingOrdersCount > 0" class="cell-sub-warning">{{ pendingOrdersCount }} 件待提货 &gt;</text>
          <text v-else class="cell-sub-text">暂无待提货 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/notice/index')">
        <view class="cell-left-part">
          <app-icon name="bell" :size="38" />
          <text class="cell-title">消息通知中心</text>
        </view>
        <view class="cell-right-part">
          <text v-if="unreadNoticeCount > 0" class="cell-sub-warning">{{ unreadNoticeCount }} 条新通知 &gt;</text>
          <text v-else class="cell-sub-text">查看通知 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/certificate/index')">
        <view class="cell-left-part">
          <app-icon name="certificate" :size="38" />
          <text class="cell-title">我的电子荣誉证书</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-text">结营认证凭证 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/rank/index')">
        <view class="cell-left-part">
          <app-icon name="trophy" :size="38" />
          <text class="cell-title">全校积分荣誉排行榜</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-text">查看排名 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="navTo('/pages/ai-chat/index')">
        <view class="cell-left-part">
          <app-icon name="bot" :size="38" />
          <text class="cell-title">AI 智能客服小智</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-ai">在线问答 &gt;</text>
        </view>
      </view>

      <view class="cell-menu-item" @click="openPasswordModal">
        <view class="cell-left-part">
          <app-icon name="lock" :size="38" />
          <text class="cell-title">修改登录密码</text>
        </view>
        <view class="cell-right-part">
          <text class="cell-sub-warning">去修改 &gt;</text>
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
          <!-- 头像上传 -->
          <view class="form-item">
            <text class="form-label">个人头像</text>
            <view class="avatar-upload-row">
              <view class="avatar-preview" @click="handleChooseAvatar">
                <image
                  v-if="formAvatar"
                  class="avatar-preview-img"
                  :src="resolveImageUrl(formAvatar)"
                  mode="aspectFill"
                />
                <text v-else class="avatar-preview-letter">{{ avatarChar }}</text>
              </view>
              <view class="avatar-upload-meta">
                <view
                  class="avatar-upload-btn"
                  :class="{ 'is-busy': uploadingAvatar }"
                  @click="handleChooseAvatar"
                >
                  <app-icon name="camera" :size="28" />
                  <text>{{ uploadingAvatar ? '上传中...' : formAvatar ? '更换照片' : '选择照片' }}</text>
                </view>
                <text class="avatar-upload-tip">支持 jpg / png / webp，单张不超过 5MB</text>
              </view>
            </view>
          </view>

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
                男生
              </view>
              <view
                :class="['radio-pill', formGender === 2 ? 'active' : '']"
                @click="formGender = 2"
              >
                女生
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

    <!-- 修改登录密码模态弹窗 -->
    <view v-if="showPasswordModal" class="modal-backdrop" @click="closePasswordModal">
      <view class="modal-card" @click.stop>
        <view class="modal-header">
          <text class="modal-title">修改登录密码</text>
          <text class="modal-close" @click="closePasswordModal">×</text>
        </view>

        <view class="modal-body">
          <view class="account-hint-pill">
            <text class="hint-label">当前学籍账号：</text>
            <text class="hint-val">{{ userInfo.name || '学生' }} ({{ userInfo.studentNo || '未登录' }})</text>
          </view>

          <view class="form-item">
            <text class="form-label">原密码 <text class="required">*</text></text>
            <input
              class="form-input"
              v-model="oldPassword"
              password
              placeholder="请输入当前登录密码"
              maxlength="32"
            />
          </view>

          <view class="form-item">
            <text class="form-label">新密码 <text class="required">*</text></text>
            <input
              class="form-input"
              v-model="newPassword"
              password
              placeholder="请输入 6 位及以上新密码"
              maxlength="32"
            />
          </view>

          <view class="form-item">
            <text class="form-label">确认新密码 <text class="required">*</text></text>
            <input
              class="form-input"
              v-model="confirmPassword"
              password
              placeholder="请再次输入新密码"
              maxlength="32"
            />
          </view>
        </view>

        <view class="modal-footer">
          <button class="modal-cancel-btn" @click="closePasswordModal">取消</button>
          <button
            class="modal-submit-btn"
            :loading="changingPassword"
            :disabled="changingPassword"
            @click="handlePasswordSubmit"
          >
            确认修改
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
/* 未登录引导卡：占据积分卡同样的上浮位置，避免未登录时露出两个 0 值 */
.login-guide-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -40rpx 32rpx 24rpx 32rpx;
  padding: 30rpx 28rpx;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border-radius: 16rpx;
  box-shadow: 0 8rpx 24rpx rgba(37, 99, 235, 0.22);
  position: relative;
  z-index: 10;
}

.lg-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.lg-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #ffffff;
}

.lg-sub {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
}

.lg-action {
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.2);
  padding: 10rpx 22rpx;
  border-radius: 22rpx;
}

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



.icon-activity {
  color: #2563eb;
}

.icon-orders {
  color: #d97706;
}

.icon-points {
  color: #7e22ce;
}

.icon-profile {
  color: #059669;
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
  /* app-icon 用 currentColor，这里统一列表项图标的灰 */
  color: #64748b;
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

.cell-sub-ai {
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 600;
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

/* 头像上传区 */
.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.avatar-preview {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: #eff6ff;
  border: 2rpx solid #dbeafe;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-preview-img {
  width: 100%;
  height: 100%;
}

.avatar-preview-letter {
  font-size: 44rpx;
  font-weight: 700;
  color: #2563eb;
}

.avatar-upload-meta {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  flex: 1;
}

.avatar-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  align-self: flex-start;
  padding: 12rpx 24rpx;
  border-radius: 40rpx;
  background: #eff6ff;
  border: 2rpx solid #bfdbfe;
  color: #2563eb;
  font-size: 24rpx;
  font-weight: 600;
}

.avatar-upload-btn.is-busy {
  opacity: 0.6;
}

.avatar-upload-tip {
  font-size: 20rpx;
  color: #94a3b8;
  line-height: 1.5;
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

.account-hint-pill {
  background: #f1f5f9;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 24rpx;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  border: 1rpx solid #e2e8f0;
}
.hint-label {
  color: #64748b;
}
.hint-val {
  color: #1e293b;
  font-weight: 600;
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
