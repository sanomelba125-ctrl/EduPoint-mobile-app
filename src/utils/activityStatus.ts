import type { ActivityItem } from '@/api/activity'

export interface ActivityStatusInfo {
  // 顶部徽章状态展示 (对照原型: 报名中 / 可候补 / 已满额 / 未开始 / 已截止 / 已报名 / 已打卡 / 已下架)
  statusLabel: string
  statusType: 'primary' | 'success' | 'warning' | 'info' | 'danger'
  
  // 核心生命周期状态判断
  isNotStarted: boolean
  isOngoing: boolean
  isEnded: boolean
  isArchived: boolean
  
  // 主操作按钮信息 (去除中括号状态，采用原型规范的自然业务文案)
  actionType: 'SIGNUP' | 'WAITLIST' | 'CHECKIN' | 'WAIT_START' | 'DISABLED'
  buttonText: string
  buttonClass: string
  disabled: boolean
  
  // 退报/退出候补操作
  canCancel: boolean
  cancelButtonText?: string
}

/**
 * 统一判定活动是否已满额
 * 契约规范对齐后端数据库定义 (V1.0.0__init.sql: registration_limit 0 表示不限制人数)：
 * 1. registrationLimit <= 0 表示不限制人数，永远不满额
 * 2. 仅当 registrationLimit > 0 且 报名/参与人数 >= registrationLimit 时判定为满额
 */
export function isActivityFull(act?: Partial<ActivityItem> | any | null): boolean {
  if (!act) return false
  const limit = act.registrationLimit !== undefined && act.registrationLimit !== null
    ? Number(act.registrationLimit)
    : 0
  if (limit <= 0) return false

  const enrolled = (act as any).participantCount !== undefined && (act as any).participantCount !== null
    ? Number((act as any).participantCount)
    : (act.enrolledCount !== undefined && act.enrolledCount !== null ? Number(act.enrolledCount) : 0)

  return enrolled >= limit
}

/**
 * 解析活动生命周期状态及按钮功能态 (对照 UI 原型规范，去除中括号状态前缀)
 */
export function getActivityStatusInfo(act?: ActivityItem | null): ActivityStatusInfo {
  if (!act) {
    return {
      statusLabel: '加载中',
      statusType: 'info',
      isNotStarted: false,
      isOngoing: false,
      isEnded: false,
      isArchived: false,
      actionType: 'DISABLED',
      buttonText: '加载中...',
      buttonClass: 'btn-disabled',
      disabled: true,
      canCancel: false
    }
  }

  const now = Date.now()
  const startMs = act.startTime ? new Date(act.startTime.replace(/-/g, '/')).getTime() : null
  const endMs = act.endTime ? new Date(act.endTime.replace(/-/g, '/')).getTime() : null

  // 1. 判断活动自身的生命周期阶段 (后端: 0-未开始, 1-进行中, 2-已截止, 3-已归档)
  let isArchived = act.status === 3
  let isEnded = act.status === 2 || (endMs !== null && endMs < now)
  let isNotStarted = act.status === 0 || (startMs !== null && startMs > now)
  let isOngoing = act.status === 1 || (!isArchived && !isEnded && !isNotStarted)

  // 状态优先级防互斥：已归档 > 已截止 > 未开始 > 进行中
  if (isArchived) {
    isEnded = false
    isNotStarted = false
    isOngoing = false
  } else if (isEnded) {
    isNotStarted = false
    isOngoing = false
  } else if (isNotStarted) {
    isOngoing = false
  }

  const myStatus = act.myEnrollmentStatus || 'NONE'
  const isFull = isActivityFull(act)

  // 2. 确定顶部徽章状态文本 (与原型一致)
  let statusLabel = '报名中'
  let statusType: 'primary' | 'success' | 'warning' | 'info' | 'danger' = 'success'

  if (isArchived) {
    statusLabel = '已下架'
    statusType = 'info'
  } else if (myStatus === 'COMPLETED') {
    // 已完成打卡优先于"已截止"：否则同屏会出现灰色"已截止"徽章与绿色"已完成"按钮互相矛盾
    statusLabel = '已打卡'
    statusType = 'success'
  } else if (isEnded) {
    statusLabel = '已截止'
    statusType = 'info'
  } else if (myStatus === 'ENROLLED') {
    statusLabel = '已报名'
    statusType = 'primary'
  } else if (myStatus === 'WAITLIST') {
    statusLabel = act.myQueueNumber ? `候补第${act.myQueueNumber}位` : '候补排队中'
    statusType = 'warning'
  } else if (isNotStarted) {
    statusLabel = '未开始'
    statusType = 'warning'
  } else if (isFull) {
    if (act.waitlistEnabled) {
      statusLabel = '可候补'
      statusType = 'warning'
    } else {
      statusLabel = '已满额'
      statusType = 'info'
    }
  } else {
    statusLabel = '报名中'
    statusType = 'success'
  }

  // 3. 构造按钮文案与业务动作 (去除中括号，符合原型优雅业务语义)

  // Case A: 活动已归档/已下架
  if (isArchived) {
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'DISABLED',
      buttonText: '活动已下架归档',
      buttonClass: 'btn-disabled',
      disabled: true,
      canCancel: false
    }
  }

  // Case B: 学生已完成现场打卡考勤
  if (myStatus === 'COMPLETED') {
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'DISABLED',
      buttonText: '已完成出勤打卡 · 积分已入账',
      buttonClass: 'btn-success-disabled',
      disabled: true,
      canCancel: false
    }
  }

  // Case C: 活动已截止/已超时
  if (isEnded) {
    if (myStatus === 'ENROLLED') {
      return {
        statusLabel,
        statusType,
        isNotStarted,
        isOngoing,
        isEnded,
        isArchived,
        actionType: 'DISABLED',
        buttonText: '活动已截止 (缺勤未打卡)',
        buttonClass: 'btn-disabled',
        disabled: true,
        canCancel: false
      }
    }
    if (myStatus === 'WAITLIST') {
      return {
        statusLabel,
        statusType,
        isNotStarted,
        isOngoing,
        isEnded,
        isArchived,
        actionType: 'DISABLED',
        buttonText: '活动已截止 (候补已失效)',
        buttonClass: 'btn-disabled',
        disabled: true,
        canCancel: false
      }
    }
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'DISABLED',
      buttonText: '活动已截止 · 报名已结束',
      buttonClass: 'btn-disabled',
      disabled: true,
      canCancel: false
    }
  }

  // Case D: 学生处于候补排队中
  if (myStatus === 'WAITLIST') {
    const qNum = act.myQueueNumber || 1
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'DISABLED',
      buttonText: `候补排队中 (第 ${qNum} 位 · 等待递补)`,
      buttonClass: 'btn-warning-disabled',
      disabled: true,
      canCancel: true,
      cancelButtonText: '退出候补'
    }
  }

  // Case E: 学生已正式报名
  if (myStatus === 'ENROLLED') {
    if (isOngoing) {
      return {
        statusLabel,
        statusType,
        isNotStarted,
        isOngoing,
        isEnded,
        isArchived,
        actionType: 'CHECKIN',
        buttonText: '现场扫码打卡',
        buttonClass: 'btn-primary',
        disabled: false,
        canCancel: true,
        cancelButtonText: '取消报名'
      }
    } else {
      return {
        statusLabel,
        statusType,
        isNotStarted,
        isOngoing,
        isEnded,
        isArchived,
        actionType: 'WAIT_START',
        buttonText: '等待开展 · 届时现场打卡',
        buttonClass: 'btn-info-outline',
        disabled: false,
        canCancel: true,
        cancelButtonText: '取消报名'
      }
    }
  }

  // Case F: 学生尚未报名 (myStatus === 'NONE')
  const ptsSuffix = act.points ? ` (+${act.points} pts)` : ''

  if (!isFull) {
    const actionTitle = isNotStarted ? '提前报名' : '立即报名'
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'SIGNUP',
      buttonText: `${actionTitle}${ptsSuffix}`,
      buttonClass: 'btn-primary',
      disabled: false,
      canCancel: false
    }
  }

  // 名额已满，允许候补排队
  if (act.waitlistEnabled) {
    const nextWait = (act.waitlistCount || 0) + 1
    return {
      statusLabel,
      statusType,
      isNotStarted,
      isOngoing,
      isEnded,
      isArchived,
      actionType: 'WAITLIST',
      buttonText: `名额已满 · 申请候补排队 (预排第${nextWait}位)`,
      buttonClass: 'btn-warning',
      disabled: false,
      canCancel: false
    }
  }

  // 名额已满，未开放候补
  return {
    statusLabel,
    statusType,
    isNotStarted,
    isOngoing,
    isEnded,
    isArchived,
    actionType: 'DISABLED',
    buttonText: '名额已满额 (未开放候补)',
    buttonClass: 'btn-disabled',
    disabled: true,
    canCancel: false
  }
}

export interface PromptCancelSignupOptions {
  title?: string
  isWaitlist: boolean
  onConfirm: () => void | Promise<void>
}

/**
 * 统一弹出取消报名/退出候补确认弹窗
 * 收敛两端页面重复的弹窗文案、确认按钮色调与交互
 */
export function promptCancelSignupModal(options: PromptCancelSignupOptions) {
  const isWait = options.isWaitlist
  const actName = options.title ? `「${options.title}」` : '当前活动'
  uni.showModal({
    title: isWait ? '退出候补确认' : '取消报名确认',
    content: isWait
      ? `确定退出${actName}的候补排队吗？退出后若重新候补需要重新按顺序排队。`
      : `确定取消${actName}的正式报名吗？取消后名额将自动释放并顺延给排队候补的同学。`,
    confirmText: isWait ? '退出候补' : '确认取消',
    confirmColor: '#ef4444',
    cancelText: isWait ? '再想想' : '保留名额',
    success: async (res) => {
      if (!res.confirm) return
      await options.onConfirm()
    }
  })
}
