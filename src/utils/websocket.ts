import { useUserStore } from '@/stores/user'

let socketTask: UniApp.SocketTask | null = null
let isConnected = false
let reconnectTimer: any = null

/**
 * 子协议标记，必须与后端 WebSocketConstants.PROTOCOL_MARKER 保持一致。
 * 浏览器 WebSocket 无法自定义请求头，因此用 [标记, token] 两个子协议把登录凭据带给服务端。
 */
const WS_SUB_PROTOCOL_MARKER = 'satoken'

/**
 * 获取当前环境的 WebSocket 服务器连接地址
 */
function getWebSocketUrl(studentId: number | string): string {
  // 若在 H5 环境下，直接通过当前域名端口 (由 Nginx 反向代理 WebSocket)
  // #ifdef H5
  if (typeof window !== 'undefined' && window.location) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${window.location.host}/api/ws/student/${studentId}`
  }
  // #endif

  return `ws://localhost:8088/api/ws/student/${studentId}`
}

/**
 * 启动学生端 WebSocket 实时推送连接
 */
export function initStudentWebSocket(studentId?: number | string | null) {
  const userStore = useUserStore()
  const uid = studentId || userStore.userInfo?.id
  if (!uid || !userStore.isLoggedIn) return

  // 握手必须携带登录凭据，缺失时直接跳过，避免反复发起必然被拒绝的连接
  const token = uni.getStorageSync('student_token')
  if (!token) {
    console.warn('[Mobile WS] 未获取到登录凭据，跳过实时推送连接')
    return
  }

  if (socketTask && isConnected) {
    return
  }

  const url = getWebSocketUrl(uid)
  console.log('[Mobile WS] 正在连接:', url)

  try {
    socketTask = uni.connectSocket({
      url,
      protocols: [WS_SUB_PROTOCOL_MARKER, token],
      success: () => {
        console.log('[Mobile WS] 发起连接成功')
      },
      fail: (err) => {
        console.warn('[Mobile WS] 发起连接失败:', err)
        scheduleReconnect(uid)
      }
    })

    if (!socketTask) return

    socketTask.onOpen(() => {
      isConnected = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      console.log(`[Mobile WS] 学生长连接建立就绪 (student_${uid})`)
    })

    socketTask.onMessage((res) => {
      console.log('[Mobile WS] 收到推送:', res.data)
      if (!res.data || res.data === '连接成功') return

      try {
        const data = JSON.parse(res.data)
        handleNotification(data)
      } catch (e) {
        uni.showToast({
          title: String(res.data),
          icon: 'none',
          duration: 3000
        })
      }
    })

    socketTask.onClose(() => {
      isConnected = false
      socketTask = null
      console.log('[Mobile WS] 连接关闭')
      scheduleReconnect(uid)
    })

    socketTask.onError((err) => {
      console.warn('[Mobile WS] 发生错误:', err)
      isConnected = false
      socketTask = null
    })
  } catch (e) {
    console.warn('[Mobile WS] 异常:', e)
    scheduleReconnect(uid)
  }
}

/**
 * 处理后端不同业务类型的实时消息
 */
function handleNotification(data: any) {
  const userStore = useUserStore()

  // 1. 积分人工调账变动
  if (data.type === 'points_adjusted') {
    if (typeof data.change === 'number') {
      userStore.updatePoints(data.change)
    }
    if (typeof data.currentPoints === 'number') {
      userStore.setUserInfo({ currentPoints: data.currentPoints })
    }
    uni.showModal({
      title: data.title || '系统积分变动',
      content: `${data.reason ? '原因：' + data.reason + '\r\n' : ''}积分变动：${data.change > 0 ? '+' : ''}${data.change} 分\r\n当前可用余额：${data.currentPoints || userStore.userInfo.currentPoints} 分`,
      showCancel: false,
      confirmText: '我知道了'
    })
    return
  }

  // 2. 活动打卡签到奖励入账
  if (data.type === 'activity_checkin_reward') {
    if (typeof data.pointsAwarded === 'number') {
      userStore.updatePoints(data.pointsAwarded)
    }
    if (typeof data.currentPoints === 'number') {
      userStore.setUserInfo({ currentPoints: data.currentPoints })
    }
    uni.showModal({
      title: '🎉 打卡奖励已到账',
      content: `参与【${data.activityTitle || '校园活动'}】成功打卡！\r\n奖励到账：+${data.pointsAwarded} 分\r\n当前可用余额：${data.currentPoints || userStore.userInfo.currentPoints} 分`,
      showCancel: false,
      confirmText: '查看详情'
    })
    return
  }

  // 3. 礼品订单核销/确认送达
  if (data.type === 'gift_send') {
    uni.showModal({
      title: '🎁 礼品核销成功',
      content: data.content || '您的礼品订单已由管理员确认送达并完成核销！',
      showCancel: false,
      confirmText: '太棒了'
    })
    return
  }

  // 4. 其他默认通知
  uni.showToast({
    title: data.title || data.content || data.msg || '收到新通知',
    icon: 'none',
    duration: 3500
  })
}

/**
 * 断线自动重连
 */
function scheduleReconnect(studentId: number | string) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    const userStore = useUserStore()
    if (userStore.isLoggedIn) {
      initStudentWebSocket(studentId)
    }
  }, 6000)
}

/**
 * 主动断开连接 (例如学生退出登录时)
 */
export function closeStudentWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socketTask) {
    try {
      socketTask.close({})
    } catch {}
    socketTask = null
  }
  isConnected = false
}
