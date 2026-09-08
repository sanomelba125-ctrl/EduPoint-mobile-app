<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores'
import { studentLoginApi } from '@/api/auth'

const userStore = useUserStore()

const studentNo = ref('')
const password = ref('')
const loading = ref(false)

// 一键填入演示学生账号 (支持榜首与测试账号)
const fillStudent = (no: string, pwd = '123456') => {
  studentNo.value = no
  password.value = pwd
}

const prefillTestStudent = () => {
  fillStudent('2023010401', '123456')
}

// 登录提交
const handleLogin = async () => {
  const no = studentNo.value.trim()
  const pwd = password.value.trim()

  if (!no) {
    uni.showToast({ title: '请输入学号', icon: 'none' })
    return
  }
  if (!pwd) {
    uni.showToast({ title: '请输入密码', icon: 'none' })
    return
  }

  loading.value = true
  try {
    const res = await studentLoginApi({
      studentNo: no,
      password: pwd
    })

    if (res && res.token) {
      userStore.setToken(res.token)
      const profile = res.userInfo || res.student || res.studentInfo || {
        id: 6,
        studentNo: no,
        name: no === '2023010401' ? '张晓明' : '张伟',
        avatar: '',
        currentPoints: no === '2023010401' ? 350 : 180,
        totalPoints: no === '2023010401' ? 420 : 320,
        college: '信息工程学院',
        className: no === '2023010401' ? '软工2301班' : '计科2201班'
      }
      userStore.setUserInfo(profile)
      uni.showToast({ title: '学籍认证成功', icon: 'success' })
      setTimeout(() => {
        uni.switchTab({ url: '/pages/activity/index' })
      }, 600)
    }
  } catch (err: any) {
    console.warn('后端登录请求异常或网络未就绪，进行演示逻辑匹配:', err)
    // 离线容灾 / 演示匹配
    if (no === '2022050109') {
      uni.showModal({
        title: '学籍认证拦截',
        content: '该账号已被系统冻结（存在代刷卡异常记录），请携带证件前往学工处核验！',
        showCancel: false
      })
    } else if ((no === '2023010401' || no === '20220101') && (pwd === '123456' || pwd === 'admin123')) {
      userStore.setToken('token_stu_mock_' + Date.now())
      userStore.setUserInfo({
        id: no === '2023010401' ? 6 : 1,
        studentNo: no,
        name: no === '2023010401' ? '张晓明' : '张伟',
        avatar: '',
        currentPoints: no === '2023010401' ? 350 : 180,
        totalPoints: no === '2023010401' ? 420 : 320,
        college: '信息工程学院',
        className: no === '2023010401' ? '软工2301班' : '计科2201班'
      })
      uni.showToast({ title: '已安全认证进入', icon: 'success' })
      setTimeout(() => {
        uni.switchTab({ url: '/pages/activity/index' })
      }, 600)
    } else {
      uni.showToast({
        title: err?.message || '认证失败：学号或密码错误',
        icon: 'none'
      })
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="login-wrapper">
    <!-- 品牌图标与系统标语 -->
    <view class="brand-hero-section">
      <view class="brand-logo-circle">
        <!-- 矢量校徽/学位帽图标 -->
        <svg viewBox="0 0 24 24" class="logo-svg">
          <path d="M12 3L1 9L12 15L21 10.09V17H23V9M5 13.18V17.18L12 21L19 17.18V13.18L12 17L5 13.18Z" />
        </svg>
      </view>
      <text class="brand-title">EduPoint 学生端</text>
      <text class="brand-sub">校园第二课堂活动与学分积分服务</text>
    </view>

    <!-- 登录表单 -->
    <view class="login-form">
      <view class="input-field-wrap">
        <view class="field-icon">
          <uni-icons type="person" size="18" color="#909399" />
        </view>
        <input
          v-model="studentNo"
          class="field-input"
          type="text"
          placeholder="请输入本人学号 (例: 2023010401)"
          placeholder-class="input-placeholder"
        />
      </view>

      <view class="input-field-wrap">
        <view class="field-icon">
          <uni-icons type="locked" size="18" color="#909399" />
        </view>
        <input
          v-model="password"
          class="field-input"
          type="password"
          placeholder="请输入统一认证密码"
          placeholder-class="input-placeholder"
          @confirm="handleLogin"
        />
      </view>

      <button
        class="submit-login-btn"
        :loading="loading"
        :disabled="loading"
        @click="handleLogin"
      >
        {{ loading ? '学籍校验中...' : '安全认证并登录' }}
      </button>
    </view>

    <!-- 业务学工须知卡片 -->
    <view class="auth-notice-card">
      <text class="notice-title">学籍账号使用须知：\n</text>
      <text class="notice-body">
        本平台依托学校教务学工系统统一授权，不支持自主注册和线上密码找回。初始密码为证件后六位。如因代刷卡违规被系统冻结或遗忘密码，请携带学生证前往学院学工组核验处理。
      </text>
    </view>

    <!-- 快捷演示填充按钮 -->
    <view class="quick-prefill-wrap">
      <view class="prefill-title">快捷载入系统内置学生体验：</view>
      <view class="prefill-btns-row">
        <button class="prefill-btn active-gold" @click="fillStudent('2023010401')">
          👑 榜首：张晓明 (420分)
        </button>
        <button class="prefill-btn" @click="fillStudent('20220101')">
          🥈 榜眼：张伟 (320分)
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.login-wrapper {
  padding: 40rpx 48rpx 60rpx;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #ffffff;
  box-sizing: border-box;
}

.brand-hero-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 40rpx 0 60rpx;
}

.brand-logo-circle {
  width: 112rpx;
  height: 112rpx;
  background-color: #409eff;
  border-radius: 24rpx;
  margin-bottom: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(64, 158, 255, 0.28);
}

.logo-svg {
  width: 60rpx;
  height: 60rpx;
  fill: #ffffff;
}

.brand-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #303133;
  line-height: 1.3;
}

.brand-sub {
  font-size: 26rpx;
  color: #909399;
  margin-top: 10rpx;
}

.login-form {
  margin-top: 20rpx;
}

.input-field-wrap {
  position: relative;
  margin-bottom: 32rpx;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 24rpx;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.field-input {
  width: 100%;
  height: 88rpx;
  padding: 0 28rpx 0 76rpx;
  border: 2rpx solid #dcdfe6;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #303133;
  background-color: #f5f7fa;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.field-input:focus {
  border-color: #409eff;
  background-color: #ffffff;
}

.input-placeholder {
  color: #a8abb2;
  font-size: 28rpx;
}

.submit-login-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #409eff;
  color: #ffffff;
  border: none;
  border-radius: 8rpx;
  font-size: 30rpx;
  font-weight: 600;
  margin-top: 16rpx;
  transition: background-color 0.2s;
}

.submit-login-btn:active {
  background-color: #337ecc;
}

.auth-notice-card {
  margin-top: 48rpx;
  background-color: #f4f4f5;
  border: 2rpx solid #e9e9eb;
  border-radius: 8rpx;
  padding: 24rpx;
  box-sizing: border-box;
}

.notice-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #303133;
  line-height: 1.6;
}

.notice-body {
  font-size: 24rpx;
  color: #606266;
  line-height: 1.7;
}

.quick-prefill-wrap {
  margin-top: auto;
  padding-top: 36rpx;
  text-align: center;
}

.prefill-title {
  font-size: 22rpx;
  color: #909399;
  margin-bottom: 16rpx;
}

.prefill-btns-row {
  display: flex;
  justify-content: center;
  gap: 16rpx;
}

.prefill-btn {
  background: #ffffff;
  border: 2rpx solid #dcdfe6;
  color: #606266;
  font-size: 23rpx;
  height: 64rpx;
  line-height: 60rpx;
  border-radius: 32rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 24rpx;
  margin: 0;
}

.prefill-btn.active-gold {
  border-color: #f7ba2a;
  color: #b88230;
  background-color: #fdf6ec;
}

.prefill-btn:active {
  background-color: #f5f7fa;
  color: #409eff;
  border-color: #c6e2ff;
}
</style>
