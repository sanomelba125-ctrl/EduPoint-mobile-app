import request from '@/utils/request'
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
  status: number // 1-报名中 2-进行中 3-已结束 4-已归档
  myEnrollmentStatus?: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' // 当前登录学生的报名状态
  myQueueNumber?: number | null
}

export interface ActivityPageQuery {
  page?: number
  size?: number
  keyword?: string
  category?: string
  status?: number
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

// 模拟演示活动基础数据库 (支持离线降级与状态记忆)
const STORAGE_KEY_ACTIVITIES = 'mock_student_activities_db'
const STORAGE_KEY_MY_RECORDS = 'mock_student_my_activities'

const DEFAULT_MOCK_ACTIVITIES: ActivityItem[] = [
  {
    id: 1,
    title: '开源鸿蒙生态前沿技术公开课',
    category: 'ACADEMIC',
    categoryName: '学术科技',
    description: '本次公开课特邀华为技术专家全面剖析开源鸿蒙（OpenHarmony）架构，重点讲解分布式软总线、微内核安全机制以及基于 ArkTS 的跨端应用实训开发流程。现场大屏滚动展示 10 秒动态签到二维码。',
    ruleDescription: '入场扫码打卡，全程参与颁发荣誉结业证书。需现场定位在 500 米考勤围栏内。',
    points: 50,
    startTime: '2026-09-09 14:30:00',
    endTime: '2026-09-09 16:30:00',
    registrationLimit: 120,
    waitlistEnabled: 1,
    enrolledCount: 120,
    waitlistCount: 6,
    locationName: '信息学部 401 报告厅',
    locationAddress: '信息科学大楼 A 区 4 楼学术报告厅',
    longitude: 114.364200,
    latitude: 30.524100,
    locationRadius: 500,
    locationCheckEnabled: 1,
    certificateEnabled: 1,
    certificateTitle: '开源鸿蒙前沿技术实训结业证书',
    certificateIssuer: '计算机科学与技术学院 / 华为高校俱乐部',
    status: 1,
    myEnrollmentStatus: 'NONE',
    myQueueNumber: null
  },
  {
    id: 2,
    title: '第十二届校园阳光马拉松志愿服务',
    category: 'VOLUNTEER',
    categoryName: '志愿公益',
    description: '校园阳光马拉松赛事补给站指引、赛道安保及医疗急救协同志愿服务，累计服务时长记入高校青年志愿者档案。',
    ruleDescription: '到达东校区南门服务点按时出勤扫码签到，服务全程须佩戴志愿者胸牌。',
    points: 80,
    startTime: '2026-09-12 08:00:00',
    endTime: '2026-09-12 12:00:00',
    registrationLimit: 50,
    waitlistEnabled: 1,
    enrolledCount: 42,
    waitlistCount: 0,
    locationName: '东校区主体育场南门',
    locationAddress: '东校区体育场 1 号检录口外侧志愿者站点',
    longitude: 114.368500,
    latitude: 30.526800,
    locationRadius: 300,
    locationCheckEnabled: 1,
    certificateEnabled: 1,
    certificateTitle: '校园阳光马拉松优秀志愿者证书',
    certificateIssuer: '校团委青年志愿者工作部',
    status: 1,
    myEnrollmentStatus: 'NONE',
    myQueueNumber: null
  },
  {
    id: 3,
    title: '3D打印与创客快速成型实训工坊',
    category: 'PRACTICE',
    categoryName: '实践文娱',
    description: '创客工坊动手体验快速成型技术，从 3D 建模到切片、上机打印一体化指导，每位同学可带走属于自己的个性化 3D 打印纪念品。',
    ruleDescription: '工坊操作注意安全规范，完成后提交实训作品并扫码完成学分认定。',
    points: 40,
    startTime: '2026-09-15 15:00:00',
    endTime: '2026-09-15 17:30:00',
    registrationLimit: 25,
    waitlistEnabled: 1,
    enrolledCount: 18,
    waitlistCount: 0,
    locationName: '工程训练中心 302 实验室',
    locationAddress: '工程训练中心 B 座 3 楼先进制造创新实验室',
    longitude: 114.361500,
    latitude: 30.521800,
    locationRadius: 200,
    locationCheckEnabled: 1,
    certificateEnabled: 0,
    status: 1,
    myEnrollmentStatus: 'NONE',
    myQueueNumber: null
  },
  {
    id: 4,
    title: '金秋校园足球新生杯八强赛',
    category: 'SPORTS',
    categoryName: '体育竞技',
    description: '一年一度秋季新生足球联赛淘汰赛，为各学院绿茵健儿呐喊助威，现场提供统一助威道具与观赛纪念徽章。',
    ruleDescription: '入场就坐观赛满 60 分钟即可扫码核验出勤学分。',
    points: 30,
    startTime: '2026-09-18 16:00:00',
    endTime: '2026-09-18 18:00:00',
    registrationLimit: 80,
    waitlistEnabled: 0,
    enrolledCount: 80,
    waitlistCount: 0,
    locationName: '西区足球场 1 号草坪',
    locationAddress: '西区综合运动场主足球区',
    longitude: 114.359200,
    latitude: 30.525500,
    locationRadius: 400,
    locationCheckEnabled: 1,
    certificateEnabled: 0,
    status: 1,
    myEnrollmentStatus: 'NONE',
    myQueueNumber: null
  },
  {
    id: 5,
    title: '青年领导力与职场表达工作坊',
    category: 'OTHER',
    categoryName: '其他拓展',
    description: '聚焦大学生职场竞争力培养，邀请知名企业 HR 总监实战传授结构化表达、无领导小组讨论及简历通关秘诀。',
    ruleDescription: '全程参与工作坊模拟演练，表现优异者推荐直通企业暑期实习面试。',
    points: 45,
    startTime: '2026-09-22 19:00:00',
    endTime: '2026-09-22 21:00:00',
    registrationLimit: 60,
    waitlistEnabled: 1,
    enrolledCount: 35,
    waitlistCount: 0,
    locationName: '大学生活动中心 201 报告厅',
    locationAddress: '大学生活动中心 2 楼多功能演艺厅',
    longitude: 114.363100,
    latitude: 30.523900,
    locationRadius: 300,
    locationCheckEnabled: 1,
    certificateEnabled: 1,
    certificateTitle: '青年骨干领导力成长训练营荣誉结业证书',
    certificateIssuer: '招生就业处 / 青年领导力研习社',
    status: 1,
    myEnrollmentStatus: 'NONE',
    myQueueNumber: null
  }
]

// 获取本地模拟活动数据
function getStoredActivities(): ActivityItem[] {
  const cached = uni.getStorageSync(STORAGE_KEY_ACTIVITIES)
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached
  }
  uni.setStorageSync(STORAGE_KEY_ACTIVITIES, DEFAULT_MOCK_ACTIVITIES)
  return DEFAULT_MOCK_ACTIVITIES
}

function saveStoredActivities(list: ActivityItem[]) {
  uni.setStorageSync(STORAGE_KEY_ACTIVITIES, list)
}

// 获取本地我的活动记录
function getStoredMyRecords(): MyActivityItem[] {
  const cached = uni.getStorageSync(STORAGE_KEY_MY_RECORDS)
  if (cached && Array.isArray(cached)) {
    return cached
  }
  // 初始预设一条已报名的活动（便于直接演示打卡）
  const initial: MyActivityItem[] = [
    {
      id: 101,
      activityId: 1,
      studentId: 1,
      status: 1, // 1-已报名
      statusDesc: '已正式报名',
      queueNumber: null,
      createTime: '2026-09-08 10:20:00',
      title: '开源鸿蒙生态前沿技术公开课',
      category: 'ACADEMIC',
      categoryName: '学术科技',
      points: 50,
      startTime: '2026-09-09 14:30:00',
      endTime: '2026-09-09 16:30:00',
      locationName: '信息学部 401 报告厅',
      locationAddress: '信息科学大楼 A 区 4 楼学术报告厅',
      longitude: 114.364200,
      latitude: 30.524100,
      locationRadius: 500,
      locationCheckEnabled: 1,
      certificateEnabled: 1,
      certificateTitle: '开源鸿蒙前沿技术实训结业证书'
    }
  ]
  uni.setStorageSync(STORAGE_KEY_MY_RECORDS, initial)
  return initial
}

function saveStoredMyRecords(records: MyActivityItem[]) {
  uni.setStorageSync(STORAGE_KEY_MY_RECORDS, records)
}

/**
 * 2.1 分页查询活动列表 (GET /activity/page)
 */
export async function getActivityPageApi(query?: ActivityPageQuery): Promise<PageResult<ActivityItem>> {
  try {
    const res = await request<PageResult<ActivityItem>>({
      url: '/activity/page',
      method: 'GET',
      data: query
    })
    if (res && res.records && res.records.length > 0) {
      return res
    }
  } catch (e) {
    // 后端无数据或服务不可达时使用保底缓存
  }

  // 本地降级实现
  const all = getStoredActivities()
  const myRecords = getStoredMyRecords()

  let filtered = all.filter(item => {
    if (query?.category && query.category !== 'ALL') {
      if (item.category !== query.category) return false
    }
    if (query?.status && item.status !== query.status) {
      return false
    }
    if (query?.keyword) {
      const kw = query.keyword.toLowerCase()
      const matchTitle = item.title.toLowerCase().includes(kw)
      const matchLoc = (item.locationName || '').toLowerCase().includes(kw)
      if (!matchTitle && !matchLoc) return false
    }
    return true
  })

  // 绑定当前学生的报名状态
  filtered = filtered.map(act => {
    const rec = myRecords.find(r => r.activityId === act.id)
    let myStatus: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' = 'NONE'
    let qNum = null
    if (rec) {
      if (rec.status === 1) myStatus = 'ENROLLED'
      else if (rec.status === 2) myStatus = 'COMPLETED'
      else if (rec.status === 4) {
        myStatus = 'WAITLIST'
        qNum = rec.queueNumber || 1
      }
    }
    return {
      ...act,
      myEnrollmentStatus: myStatus,
      myQueueNumber: qNum
    }
  })

  const page = query?.page || 1
  const size = query?.size || 10
  const start = (page - 1) * size
  const records = filtered.slice(start, start + size)

  return {
    records,
    total: filtered.length,
    size,
    current: page
  }
}

/**
 * 2.2 查询活动详情 (GET /activity/{id})
 */
export async function getActivityDetailApi(id: number): Promise<ActivityItem> {
  try {
    const res = await request<ActivityItem>({
      url: `/activity/${id}`,
      method: 'GET'
    })
    if (res && res.id) {
      return res
    }
  } catch (e) {
    // 降级兜底
  }

  const all = getStoredActivities()
  const act = all.find(item => item.id === Number(id)) || all[0]
  const myRecords = getStoredMyRecords()
  const rec = myRecords.find(r => r.activityId === act.id)

  let myStatus: 'NONE' | 'ENROLLED' | 'WAITLIST' | 'COMPLETED' = 'NONE'
  let qNum = null
  if (rec) {
    if (rec.status === 1) myStatus = 'ENROLLED'
    else if (rec.status === 2) myStatus = 'COMPLETED'
    else if (rec.status === 4) {
      myStatus = 'WAITLIST'
      qNum = rec.queueNumber || 7
    }
  }

  return {
    ...act,
    myEnrollmentStatus: myStatus,
    myQueueNumber: qNum
  }
}

/**
 * 3.1 学生报名活动 (POST /student/activity/signup)
 */
export async function signupActivityApi(activityId: number): Promise<SignupResult> {
  try {
    const res = await request<SignupResult>({
      url: '/student/activity/signup',
      method: 'POST',
      data: { activityId }
    })
    if (res && res.status) {
      return res
    }
  } catch (e: any) {
    if (e?.message && e.message.includes('已报名')) {
      throw e
    }
    // 若后端未实现该接口，进入前端状态持久化兜底
  }

  // 状态兜底
  const activities = getStoredActivities()
  const act = activities.find(a => a.id === activityId)
  if (!act) throw new Error('活动不存在')

  const myRecords = getStoredMyRecords()
  const exist = myRecords.find(r => r.activityId === activityId && (r.status === 1 || r.status === 4))
  if (exist) {
    throw new Error('您已报名或在候补队列中，请勿重复操作')
  }

  const isFull = act.enrolledCount >= act.registrationLimit
  if (isFull) {
    if (!act.waitlistEnabled) {
      throw new Error('名额已满额，且该活动未开放候补排队')
    }
    // 进入候补排队
    const nextQueue = (act.waitlistCount || 0) + 1
    act.waitlistCount = nextQueue
    saveStoredActivities(activities)

    const newRecord: MyActivityItem = {
      id: Date.now(),
      activityId: act.id,
      studentId: 1,
      status: 4, // 4-候补中
      statusDesc: '候补排队中',
      queueNumber: nextQueue,
      createTime: new Date().toLocaleString(),
      title: act.title,
      category: act.category,
      categoryName: act.categoryName,
      points: act.points,
      startTime: act.startTime,
      endTime: act.endTime,
      locationName: act.locationName,
      locationAddress: act.locationAddress,
      longitude: act.longitude,
      latitude: act.latitude,
      locationRadius: act.locationRadius,
      locationCheckEnabled: act.locationCheckEnabled,
      certificateEnabled: act.certificateEnabled,
      certificateTitle: act.certificateTitle
    }
    myRecords.unshift(newRecord)
    saveStoredMyRecords(myRecords)

    return {
      status: 'WAITLIST',
      waitlist: true,
      queueNumber: nextQueue,
      message: `名额已满，您已进入候补队列（排第 ${nextQueue} 位）`
    }
  }

  // 正式报名成功
  act.enrolledCount += 1
  saveStoredActivities(activities)

  const newRecord: MyActivityItem = {
    id: Date.now(),
    activityId: act.id,
    studentId: 1,
    status: 1, // 1-已报名
    statusDesc: '已正式报名',
    queueNumber: null,
    createTime: new Date().toLocaleString(),
    title: act.title,
    category: act.category,
    categoryName: act.categoryName,
    points: act.points,
    startTime: act.startTime,
    endTime: act.endTime,
    locationName: act.locationName,
    locationAddress: act.locationAddress,
    longitude: act.longitude,
    latitude: act.latitude,
    locationRadius: act.locationRadius,
    locationCheckEnabled: act.locationCheckEnabled,
    certificateEnabled: act.certificateEnabled,
    certificateTitle: act.certificateTitle
  }
  myRecords.unshift(newRecord)
  saveStoredMyRecords(myRecords)

  return {
    status: 'ENROLLED',
    waitlist: false,
    queueNumber: null,
    message: '您已成功正式报名该活动！'
  }
}

/**
 * 3.2 学生取消报名 (POST /student/activity/cancel-signup)
 */
export async function cancelSignupActivityApi(activityId: number): Promise<void> {
  try {
    await request<void>({
      url: '/student/activity/cancel-signup',
      method: 'POST',
      data: { activityId }
    })
    return
  } catch (e) {
    // 降级更新
  }

  const activities = getStoredActivities()
  const act = activities.find(a => a.id === activityId)

  const myRecords = getStoredMyRecords()
  const recIndex = myRecords.findIndex(r => r.activityId === activityId && (r.status === 1 || r.status === 4))
  if (recIndex !== -1) {
    const wasEnrolled = myRecords[recIndex].status === 1
    myRecords[recIndex].status = 3 // 3-已失效/已取消
    myRecords[recIndex].statusDesc = '已取消报名'
    saveStoredMyRecords(myRecords)

    if (act) {
      if (wasEnrolled && act.enrolledCount > 0) {
        act.enrolledCount -= 1
      } else if (!wasEnrolled && (act.waitlistCount || 0) > 0) {
        act.waitlistCount = Math.max(0, (act.waitlistCount || 1) - 1)
      }
      saveStoredActivities(activities)
    }
  }
}

/**
 * 3.3 扫码动态打卡签到 (POST /student/activity/checkin)
 */
export async function checkinActivityApi(params: CheckinParams): Promise<CheckinResult> {
  try {
    const res = await request<CheckinResult>({
      url: '/student/activity/checkin',
      method: 'POST',
      data: params
    })
    if (res && res.pointsAwarded !== undefined) {
      return res
    }
  } catch (e: any) {
    if (e?.message && (e.message.includes('未报名') || e.message.includes('超出范围'))) {
      throw e
    }
    // 降级模拟打卡事务处理
  }

  const activities = getStoredActivities()
  const act = activities.find(a => a.id === params.activityId) || activities[0]

  const myRecords = getStoredMyRecords()
  const rec = myRecords.find(r => r.activityId === act.id)

  const nowStr = new Date().toLocaleString()
  const pointsAwarded = act.points || 50

  if (rec) {
    rec.status = 2 // 2-已完成
    rec.statusDesc = '已完成打卡'
    rec.checkinTime = nowStr
    rec.pointsAwarded = pointsAwarded
    saveStoredMyRecords(myRecords)
  } else {
    // 补充一条完成记录
    myRecords.unshift({
      id: Date.now(),
      activityId: act.id,
      studentId: 1,
      status: 2,
      statusDesc: '已完成打卡',
      queueNumber: null,
      pointsAwarded,
      checkinTime: nowStr,
      createTime: nowStr,
      title: act.title,
      category: act.category,
      categoryName: act.categoryName,
      points: pointsAwarded,
      startTime: act.startTime,
      endTime: act.endTime,
      locationName: act.locationName,
      longitude: act.longitude,
      latitude: act.latitude,
      locationRadius: act.locationRadius,
      locationCheckEnabled: act.locationCheckEnabled,
      certificateEnabled: act.certificateEnabled,
      certificateTitle: act.certificateTitle
    })
    saveStoredMyRecords(myRecords)
  }

  // 模拟从用户存储读取最新可用积分
  const userJson = uni.getStorageSync('student_user_info')
  let currentPoints = 1250
  if (userJson) {
    try {
      const u = typeof userJson === 'string' ? JSON.parse(userJson) : userJson
      currentPoints = (u.currentPoints || 0) + pointsAwarded
    } catch {}
  }

  return {
    pointsAwarded,
    currentPoints,
    certificateIssued: act.certificateEnabled === 1,
    checkinTime: nowStr
  }
}

/**
 * 3.4 学生查询我的活动参与记录 (GET /student/activity/my-list)
 */
export async function getMyActivitiesApi(query?: MyActivityQuery): Promise<PageResult<MyActivityItem>> {
  try {
    const res = await request<PageResult<MyActivityItem>>({
      url: '/student/activity/my-list',
      method: 'GET',
      data: query
    })
    if (res && res.records) {
      return res
    }
  } catch (e) {
    // 降级读取
  }

  const allRecords = getStoredMyRecords()
  let filtered = allRecords
  if (query?.status) {
    filtered = allRecords.filter(r => r.status === query.status)
  }

  const page = query?.page || 1
  const size = query?.size || 20
  const start = (page - 1) * size
  const records = filtered.slice(start, start + size)

  return {
    records,
    total: filtered.length,
    size,
    current: page
  }
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
