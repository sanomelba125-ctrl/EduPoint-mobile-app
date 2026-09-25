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
  /**
   * 请求幂等标识（UUID）。
   * 同一次「兑换意图」内保持不变——弱网重试、用户手动重试都复用同一个标识；
   * 兑换成功后重置，下一次兑换使用新标识。服务端据此保证同一标识只落一单。
   * 若调用方未传，API 层将自动生成兜底 UUID，确保出网请求必带有效标识。
   */
  requestId?: string
  /**
   * 服务端下发的防重兑换令牌 (P2-2 治理升级)。
   * 进入商品详情页由 GET /gift/{id}/token 动态下发，存入 Redis，TTL 10min；
   * 提交兑换时由服务端执行 Lua 脚本原子核验并销毁（一次性 Token 桶），防重进页面重复下单与重放攻击。
   */
  exchangeToken?: string
  giftId: number
  quantity: number
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
}

/**
 * 生成兑换请求幂等标识（UUID v4 形态）。
 * 不是安全凭据，仅用于服务端识别「同一次兑换意图」的重复提交，故统一使用
 * 跨端一致的随机实现，避免依赖各端 crypto.randomUUID 的可用性差异。
 */
export function generateExchangeRequestId(): string {
  const hex = (len: number) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
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
  remark?: string
  createTime: string
  giftName?: string
  giftImage?: string
}

export type { PageResult } from '@/types/common'

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

export interface GiftExchangeTokenResult {
  token: string
  giftId: number
  expireSeconds: number
  createTime?: string
}

/**
 * 学生进入礼品详情页获取防重兑换令牌 (GET /api/gift/{id}/token)
 */
export function getGiftExchangeTokenApi(id: number): Promise<GiftExchangeTokenResult> {
  return request<GiftExchangeTokenResult>({
    url: `/gift/${id}/token`,
    method: 'GET'
  })
}

/**
 * 学生发起礼品兑换 (POST /api/gift/exchange)
 */
export function exchangeGiftApi(params: GiftExchangeParams): Promise<GiftExchangeResult> {
  const payload: GiftExchangeParams = {
    ...params,
    requestId: params.requestId && params.requestId.trim() ? params.requestId.trim() : generateExchangeRequestId()
  }
  return request<GiftExchangeResult>({
    url: '/gift/exchange',
    method: 'POST',
    data: payload
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
