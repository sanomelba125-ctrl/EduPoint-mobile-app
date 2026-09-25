import request from '@/utils/request'

export interface StudentScoreBalanceVO {
  currentPoints: number
  totalPoints: number
  rank?: number
}

export interface RankStudentVO {
  rank: number
  studentId: number
  studentNo: string
  name: string
  avatar?: string
  college?: string
  className?: string
  totalPoints: number
  currentPoints?: number
  isMe?: boolean
}

export interface StudentRankResultVO {
  records: RankStudentVO[]
  total: number
  myRank?: RankStudentVO
  diffToPrevious?: number
  previousStudentName?: string
}

export interface StudentPointRecordVO {
  id: number
  recordNo: string
  studentId: number
  type: number
  typeDesc: string
  changePoints: number
  beforePoints: number
  afterPoints: number
  description: string
  businessType?: string
  businessId?: string
  createTime: string
}

export type { PageResult } from '@/types/common'

/**
 * 查询学生当前可用积分与历史累计学分 (GET /api/student/score/balance)
 */
export function getScoreBalanceApi(): Promise<StudentScoreBalanceVO> {
  return request<StudentScoreBalanceVO>({
    url: '/student/score/balance',
    method: 'GET'
  })
}

/**
 * 查询学分光荣榜列表 (GET /api/student/score/rank)
 */
export function getLeaderboardApi(params?: { page?: number; size?: number; college?: string }): Promise<StudentRankResultVO> {
  return request<StudentRankResultVO>({
    url: '/student/score/rank',
    method: 'GET',
    data: params
  })
}

/**
 * 学生分页查询个人积分变动流水 (GET /api/student/score/records)
 */
export function getPointRecordsApi(params?: { page?: number; size?: number; type?: number }): Promise<PageResult<StudentPointRecordVO>> {
  return request<PageResult<StudentPointRecordVO>>({
    url: '/student/score/records',
    method: 'GET',
    data: params
  })
}
