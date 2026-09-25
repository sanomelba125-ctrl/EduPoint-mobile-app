import { request } from '@/utils/request'

export interface SysNoticeVO {
  id: number
  receiverType: number // 1-管理员 2-学生
  receiverId: number
  type: string
  typeName: string
  title: string
  content: string
  bizId?: number
  isRead: number // 0-未读 1-已读
  readTime?: string
  createTime: string
}

import type { PageResult } from '@/types/common'

export type NoticePageResult = PageResult<SysNoticeVO>

/**
 * 分页查询学生端系统通知
 */
export function getMyNoticesApi(params?: {
  page?: number
  size?: number
  isRead?: number
  keyword?: string
}) {
  return request<NoticePageResult>({
    url: '/notice/my-list',
    method: 'GET',
    data: params
  })
}

/**
 * 获取未读通知数量
 */
export function getUnreadNoticeCountApi() {
  return request<number>({
    url: '/notice/unread-count',
    method: 'GET'
  })
}

/**
 * 标记单条通知为已读
 */
export function markNoticeAsReadApi(id: number) {
  return request<boolean>({
    url: `/notice/${id}/read`,
    method: 'PUT'
  })
}

/**
 * 全部标记为已读
 */
export function markAllNoticesAsReadApi() {
  return request<boolean>({
    url: '/notice/read-all',
    method: 'PUT'
  })
}

/**
 * 删除通知
 */
export function deleteNoticeApi(id: number) {
  return request<boolean>({
    url: `/notice/${id}`,
    method: 'DELETE'
  })
}
