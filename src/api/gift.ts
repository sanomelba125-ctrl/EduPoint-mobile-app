import request from '@/utils/request'

export interface GiftItem {
  id: number
  name: string
  description?: string
  image?: string
  pointsCost: number
  stock: number
  version: number
  status: number // 1-上架 0-下架
  createTime?: string
  updateTime?: string
}

export interface GiftExchangeParams {
  giftId: number
  quantity: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
}

export interface GiftExchangeResult {
  orderNo: string
  pickupCode: string
  pointsCost: number
  remainPoints: number
  giftName: string
  quantity: number
}

export interface StudentGiftOrder {
  id: number
  orderNo: string
  studentId: number
  giftId: number
  quantity: number
  pointsCost: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  pickupCode: string
  status: number // 1-待提货 2-已核销 3-已取消
  refundPointsStatus: number // 0-未退 1-已退
  deliveryTime?: string
  cancelTime?: string
  cancelReason?: string
  createTime: string
  giftName?: string
  giftImage?: string
}

export interface PageResult<T> {
  records: T[]
  total: number
  size: number
  current: number
}

/**
 * 获取礼品列表 (GET /api/gift/list)
 */
export function getGiftListApi(params?: { page?: number; size?: number; status?: number }): Promise<PageResult<GiftItem>> {
  return request<PageResult<GiftItem>>({
    url: '/gift/list',
    method: 'GET',
    data: params
  })
}

/**
 * 获取礼品详情 (GET /api/gift/{id})
 */
export function getGiftDetailApi(id: number): Promise<GiftItem> {
  return request<GiftItem>({
    url: `/gift/${id}`,
    method: 'GET'
  })
}

/**
 * 学生发起礼品兑换 (POST /api/gift/exchange)
 */
export function exchangeGiftApi(params: GiftExchangeParams): Promise<GiftExchangeResult> {
  return request<GiftExchangeResult>({
    url: '/gift/exchange',
    method: 'POST',
    data: params
  })
}

/**
 * 获取我的兑换订单列表 (GET /api/gift/my)
 */
export function getMyOrdersApi(params?: { page?: number; size?: number; status?: number }): Promise<PageResult<StudentGiftOrder>> {
  return request<PageResult<StudentGiftOrder>>({
    url: '/gift/my',
    method: 'GET',
    data: params
  })
}

/**
 * 学生自主取消待提货订单 (POST /api/gift/orders/{orderId}/cancel)
 */
export function cancelMyOrderApi(orderId: number): Promise<void> {
  return request<void>({
    url: `/gift/orders/${orderId}/cancel`,
    method: 'POST'
  })
}
