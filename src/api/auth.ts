import request from '@/utils/request'
import type { StudentUserInfo } from '@/stores/user'

export interface StudentLoginParams {
  studentNo: string
  password?: string
}

export interface StudentLoginResult {
  token: string
  student?: StudentUserInfo
  studentInfo?: StudentUserInfo
  userInfo?: StudentUserInfo
}

/**
 * 移动学生端认证登录 (POST /api/student/login)
 */
export function studentLoginApi(params: StudentLoginParams): Promise<StudentLoginResult> {
  return request<StudentLoginResult>({
    url: '/student/login',
    method: 'POST',
    data: params
  })
}

/**
 * 移动学生端退出登录 (POST /api/student/logout)
 */
export function studentLogoutApi(): Promise<void> {
  return request<void>({
    url: '/student/logout',
    method: 'POST'
  })
}

/**
 * 获取当前登录学生个人档案 (GET /api/student/info)
 */
export function getStudentProfileApi(): Promise<StudentUserInfo> {
  return request<StudentUserInfo>({
    url: '/student/info',
    method: 'GET'
  })
}

export interface StudentUpdateProfileParams {
  name?: string
  phone?: string
  avatar?: string
  gender?: number
}

/**
 * 修改当前登录学生个人档案 (PUT /api/student/profile)
 */
export function updateStudentProfileApi(params: StudentUpdateProfileParams): Promise<StudentUserInfo> {
  return request<StudentUserInfo>({
    url: '/student/profile',
    method: 'PUT',
    data: params
  })
}

