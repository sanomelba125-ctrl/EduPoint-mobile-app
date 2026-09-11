import request from '@/utils/request'

export interface AiFaqItem {
  id: number
  category: string
  question: string
  keywords: string
}

/**
 * 获取推荐常见问答列表 (GET /api/ai/faq/recommended)
 */
export function getRecommendedFaqsApi(limit = 6): Promise<AiFaqItem[]> {
  return request<AiFaqItem[]>({
    url: `/ai/faq/recommended?limit=${limit}`,
    method: 'GET'
  })
}
