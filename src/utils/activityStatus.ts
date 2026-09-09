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
  const enrolled = (act as any).participantCount !== undefined ? (act as any).participantCount : (act.enrolledCount !== undefined ? act.enrolledCount : 0)
  const isFull = enrolled >= act.registrationLimit

  // 2. 确定顶部徽章状态文本 (与原型一致)
  let statusLabel = '报名中'
  let statusType: 'primary' | 'success' | 'warning' | 'info' | 'danger' = 'success'

  if (isArchived) {
    statusLabel = '已下架'
    statusType = 'info'
  } else if (isEnded) {
    statusLabel = '已截止'
    statusType = 'info'
  } else if (myStatus === 'COMPLETED') {
    statusLabel = '已打卡'
    statusType = 'success'
  } else if (myStatus === 'ENROLLED') {
    statusLabel = '已报名'
    statusType = 'primary'
  } else if (myStatus === 'WAITLIST') {
    const qNum = act.myQueueNumber || 1
    statusLabel = `候补第${qNum}位`
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
      buttonText: '已完成出勤打卡 · 学分已入账',
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
