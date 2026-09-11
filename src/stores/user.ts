import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { initStudentWebSocket, closeStudentWebSocket } from '@/utils/websocket'

export interface StudentUserInfo {
  id: number | null
  studentNo: string
  name: string
  avatar: string
  phone?: string
  currentPoints: number
  totalPoints: number
  college?: string
  major?: string
  className?: string
  gender?: number
}

const DEFAULT_USER_INFO: StudentUserInfo = {
  id: null,
  studentNo: '',
  name: '未登录',
  avatar: '',
  phone: '',
  currentPoints: 0,
  totalPoints: 0,
  college: '',
  major: '',
  className: '',
  gender: 1
}

export const useUserStore = defineStore('user', () => {
  // 从本地缓存恢复 Token
  const token = ref<string>(uni.getStorageSync('student_token') || '')

  // 从本地缓存恢复用户信息
  const cachedInfo = (() => {
    try {
      const stored = uni.getStorageSync('student_info')
      return stored ? JSON.parse(stored) : DEFAULT_USER_INFO
    } catch (e) {
      return DEFAULT_USER_INFO
    }
  })()

  const userInfo = ref<StudentUserInfo>(cachedInfo)

  // 是否已登录
  const isLoggedIn = computed(() => !!token.value)

  // 保存登录 Token
  const setToken = (newToken: string) => {
    token.value = newToken
    uni.setStorageSync('student_token', newToken)
  }

  // 设置用户信息
  const setUserInfo = (info: Partial<StudentUserInfo>) => {
    userInfo.value = {
      ...userInfo.value,
      ...info
    }
    uni.setStorageSync('student_info', JSON.stringify(userInfo.value))
    if (userInfo.value.id) {
      initStudentWebSocket(userInfo.value.id)
    }
  }

  // 变动积分（如兑换礼品扣除负数、活动签到奖励正数）
  // 核心优势：修改此状态后，整个移动端所有页面（商城、个人中心、首页）积分实时同步！
  const updatePoints = (delta: number) => {
    userInfo.value.currentPoints = Math.max(0, (userInfo.value.currentPoints || 0) + delta)
    if (delta > 0) {
      userInfo.value.totalPoints = (userInfo.value.totalPoints || 0) + delta
    }
    uni.setStorageSync('student_info', JSON.stringify(userInfo.value))
  }

  // 退出登录
  const logout = () => {
    closeStudentWebSocket()
    token.value = ''
    userInfo.value = { ...DEFAULT_USER_INFO }
    uni.removeStorageSync('student_token')
    uni.removeStorageSync('student_info')
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    setToken,
    setUserInfo,
    updatePoints,
    logout
  }
})
