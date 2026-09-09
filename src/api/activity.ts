import request, { type ApiError } from '@/utils/request'
import type { PageResult } from './gift'

export interface ActivityItem {
  id: number
  title: string
  category: string
  categoryName?: string
  description?: string
  ruleDescription?: string
  coverImage?: string
  points: number
  startTime: string
  endTime: string
  registrationLimit: number
  waitlistEnabled: number // 1-开启 0-关闭
  participantCount?: number // 后端返回的当前已报名人数
  enrolledCount: number // 当前正式已报名人数
  waitlistCount?: number // 当前排队候补人数
  locationName: string
  locationAddress?: string
  longitude: number
  latitude: number
  locationRadius: number // 核验半径（米）
  locationCheckEnabled: number // 1-开启定位核验 0-不校验
  certificateEnabled: number // 1-颁发证书 0-不颁发
  certificateTitle?: string
  certificateIssuer?: string
  status: number // 0-未开始 1-进行中 2-已截止 3-已归档
  myEnrollmentStatus?: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' // 当前登录学生的报名状态
  myQueueNumber?: number | null
}

export { getActivityStatusInfo, type ActivityStatusInfo } from '@/utils/activityStatus'
export { type ApiError } from '@/utils/request'

export interface ActivityPageQuery {
  page?: number
  size?: number
  keyword?: string
  category?: string
  status?: number
  excludeArchived?: boolean
}

export interface SignupResult {
  status: 'ENROLLED' | 'WAITLIST'
  waitlist: boolean
  message: string
  queueNumber?: number | null
}

export interface CheckinParams {
  activityId: number
  nonce: string
  sign: string
  checkinLatitude: number
  checkinLongitude: number
}

export interface CheckinResult {
  pointsAwarded: number
  currentPoints: number
  certificateIssued: boolean
  checkinTime: string
}

export interface MyActivityItem {
  id: number
  activityId: number
  studentId: number
  status: number // 1-已报名 2-已完成 3-已取消/已失效 4-候补中
  statusDesc?: string
  queueNumber?: number | null
  pointsAwarded?: number
  checkinTime?: string
  createTime: string
  // 关联活动摘要字段
  title: string
  category: string
  categoryName?: string
  coverImage?: string
  points: number
  startTime: string
  endTime: string
  locationName: string
  locationAddress?: string
  longitude: number
  latitude: number
  locationRadius: number
  locationCheckEnabled: number
  certificateEnabled: number
  certificateTitle?: string
}

export interface MyActivityQuery {
  page?: number
  size?: number
  status?: number // 1-已报名 2-已完成 3-已失效
}

/**
 * 2.1 分页查询活动列表 (GET /activity/page)
 */
export async function getActivityPageApi(query?: ActivityPageQuery): Promise<PageResult<ActivityItem>> {
  const reqData = {
    excludeArchived: true,
    ...query
  }

  const res = await request<PageResult<ActivityItem>>({
    url: '/activity/page',
    method: 'GET',
    data: reqData
  })

  // 若已登录，尝试查询学生个人已报名单，精准绑定 myEnrollmentStatus
  const token = uni.getStorageSync('student_token')
  const myStatusMap = new Map<number, { status: number; queueNumber?: number | null }>()

  if (token) {
    try {
      const myRes = await request<PageResult<any>>({
        url: '/student/activity/my-list',
        method: 'GET',
        data: { page: 1, size: 100 }
      })
      if (myRes && myRes.records) {
        myRes.records.forEach((r: any) => {
          if (r.activityId && (r.status === 1 || r.status === 2 || r.status === 4)) {
            myStatusMap.set(r.activityId, { status: r.status, queueNumber: r.queueNumber })
          }
        })
      }
    } catch {
      // 查询个人记录失败时不阻断广场展示
    }
  }

  if (res && res.records) {
    const validRecords = res.records.filter(act => act.status !== 3)
    const bound = validRecords.map(act => {
      let myStatus: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' = 'NONE'
      let qNum: number | null = null
      const rec = myStatusMap.get(act.id)
      if (rec) {
        if (rec.status === 1) myStatus = 'ENROLLED'
        else if (rec.status === 2) myStatus = 'COMPLETED'
        else if (rec.status === 4) {
          myStatus = 'WAITLIST'
          qNum = rec.queueNumber || 1
        }
      }
      const rawCount = (act as any).participantCount !== undefined ? (act as any).participantCount : act.enrolledCount
      const enrolled = rawCount !== undefined && rawCount !== null ? Number(rawCount) : 0
      return {
        ...act,
        enrolledCount: enrolled,
        participantCount: enrolled,
        myEnrollmentStatus: act.myEnrollmentStatus || myStatus,
        myQueueNumber: act.myQueueNumber || qNum
      }
    })
    return {
      ...res,
      records: bound
    }
  }

  return res
}

/**
 * 2.2 查询活动详情 (GET /activity/{id})
 */
export async function getActivityDetailApi(id: number): Promise<ActivityItem> {
  const res = await request<ActivityItem>({
    url: `/activity/${id}`,
    method: 'GET'
  })

  let myStatus: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' = 'NONE'
  let qNum: number | null = null
  const token = uni.getStorageSync('student_token')

  if (token) {
    try {
      const myRes = await request<PageResult<any>>({
        url: '/student/activity/my-list',
        method: 'GET',
        data: { page: 1, size: 100 }
      })
      if (myRes && myRes.records) {
        const found = myRes.records.find(
          (r: any) => r.activityId === Number(id) && (r.status === 1 || r.status === 2 || r.status === 4)
        )
        if (found) {
          if (found.status === 1) myStatus = 'ENROLLED'
          else if (found.status === 2) myStatus = 'COMPLETED'
          else if (found.status === 4) {
            myStatus = 'WAITLIST'
            qNum = found.queueNumber || 1
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  const rawCount = (res as any).participantCount !== undefined ? (res as any).participantCount : res.enrolledCount
  const enrolled = rawCount !== undefined && rawCount !== null ? Number(rawCount) : 0

  return {
    ...res,
    enrolledCount: enrolled,
    participantCount: enrolled,
    myEnrollmentStatus: res.myEnrollmentStatus || myStatus,
    myQueueNumber: res.myQueueNumber || qNum
  }
}

/**
 * 3.1 学生报名活动 (POST /student/activity/signup)
 * 后端业务失败时直接抛出异常，不允许使用本地 mock 假成功
 */
export async function signupActivityApi(activityId: number): Promise<SignupResult> {
  return await request<SignupResult>({
    url: '/student/activity/signup',
    method: 'POST',
    data: { activityId }
  })
}

/**
 * 3.2 学生取消报名 (POST /student/activity/cancel-signup)
 * 后端业务失败时直接抛出异常，不允许本地静默修改为已取消
 */
export async function cancelSignupActivityApi(activityId: number): Promise<void> {
  await request<void>({
    url: '/student/activity/cancel-signup',
    method: 'POST',
    data: { activityId }
  })
}

/**
 * 3.3 扫码动态打卡签到 (POST /student/activity/checkin)
 * 后端打卡失败时直接抛出异常，不允许虚假完成并增加积分
 */
export async function checkinActivityApi(params: CheckinParams): Promise<CheckinResult> {
  return await request<CheckinResult>({
    url: '/student/activity/checkin',
    method: 'POST',
    data: params
  })
}

/**
 * 3.4 学生查询我的活动参与记录 (GET /student/activity/my-list)
 */
export async function getMyActivitiesApi(query?: MyActivityQuery): Promise<PageResult<MyActivityItem>> {
  const res = await request<PageResult<any>>({
    url: '/student/activity/my-list',
    method: 'GET',
    data: query
  })

  if (res && res.records) {
    // 补充展示字段
    const enrichedRecords = await Promise.all(
      res.records.map(async (item: any) => {
        let actDetail: Partial<ActivityItem> = {}
        try {
          actDetail = await getActivityDetailApi(item.activityId)
        } catch {
          // 详情接口异常时不阻断列表展示
        }
        return {
          ...item,
          title: item.title || actDetail.title || `校园活动 #${item.activityId}`,
          startTime: item.startTime || actDetail.startTime || item.signupTime || '',
          endTime: item.endTime || actDetail.endTime || '',
          locationName: item.locationName || actDetail.locationName || '校区指定场地',
          points: item.points || actDetail.points || item.pointsAwarded || 0,
          categoryName: item.categoryName || actDetail.categoryName || '校园活动',
          coverImage: item.coverImage || actDetail.coverImage || '',
          certificateEnabled:
            item.certificateEnabled !== undefined ? item.certificateEnabled : actDetail.certificateEnabled
        }
      })
    )
    return {
      ...res,
      records: enrichedRecords
    }
  }

  return res
}

/**
 * 计算两个 GPS 经纬度坐标之间的直线距离（米）
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // 地球半径（米）
  const rad = (d: number) => (d * Math.PI) / 180.0
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}
