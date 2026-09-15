import request from '@/utils/request'

export interface AiFaqItem {
  id: number
  category: string
  question: string
  keywords: string
}

export interface AiChatMessageItem {
  id: number | string
  studentId?: number
  conversationId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source?: string
  toolCall?: {
    toolCallId?: string
    toolName: string
    description?: string
    status: string
    arguments?: string
    resultFactJson?: string
    executionTimeMs?: number
  }
  createTime?: string
  time?: string
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

/**
 * 获取 AI 历史对话记录 (GET /api/ai/chat/history)
 */
export function getChatHistoryApi(params?: {
  conversationId?: string
  limit?: number
  simulateStudentNo?: string
}): Promise<AiChatMessageItem[]> {
  return request<AiChatMessageItem[]>({
    url: '/ai/chat/history',
    method: 'GET',
    data: params
  })
}

/**
 * 清空 AI 历史对话记录 (DELETE /api/ai/chat/history)
 */
export function clearChatHistoryApi(params?: {
  conversationId?: string
  simulateStudentNo?: string
}): Promise<void> {
  return request<void>({
    url: '/ai/chat/history',
    method: 'DELETE',
    data: params
  })
}
