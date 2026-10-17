<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { getRecommendedFaqsApi, getChatHistoryApi, clearChatHistoryApi, type AiFaqItem } from '@/api/ai'
import { useUserStore } from '@/stores'
import { parseMarkdownLines, type MdLine, type MdSeg } from '@/utils/markdown'
import { resolveImageUrl } from '@/utils/image'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  source?: string
  isStreaming?: boolean
  toolCall?: {
    toolName: string
    description?: string
    status: string
    arguments?: string
    resultFactJson?: string
    executionTimeMs?: number
  }
  time: string
}

const toolNameMap: Record<string, string> = {
  query_my_points: '查询个人积分与流水明细',
  query_my_orders: '查询礼品兑换订单与提货码',
  query_my_activities: '查询校园活动报名与候补',
  query_my_certificates: '查询荣誉结项证书与验真码',
  search_platform_knowledge: '检索官方知识库规则'
}

const formatToolName = (name?: string) => {
  if (!name) return '业务数据工具'
  return toolNameMap[name] || name
}

// 工具调用三态文案：失败时不得宣称"已调取业务事实"
const toolChipText = (tc: NonNullable<ChatMessage['toolCall']>) => {
  const name = formatToolName(tc.toolName)
  if (tc.status === 'CALLING') return `正在调用【${name}】查询...`
  if (tc.status === 'FAILED') return `【${name}】查询失败，以下为通用解答`
  return `已调取【${name}】业务事实`
}

/**
 * 助手消息 Markdown 渲染缓存。
 * 按消息对象缓存解析结果，仅当 content 变化时才重新解析 ——
 * 流式输出时每收到一个分块都会触发重渲染，缓存可避免整段反复解析。
 */
const mdCache = new WeakMap<object, { src: string; lines: MdLine[] }>()

/** 取（或惰性解析）助手消息的 Markdown 渲染行；学生消息不做处理 */
const mdLinesOf = (msg: ChatMessage): MdLine[] => {
  if (msg.role !== 'assistant') return []
  const src = msg.content || ''
  let entry = mdCache.get(msg)
  if (!entry || entry.src !== src) {
    entry = { src, lines: parseMarkdownLines(src) }
    mdCache.set(msg, entry)
  }
  return entry.lines
}

/** 行内片段（加粗/斜体/行内代码）的样式类 */
const segCls = (sg: MdSeg) => ({
  'md-bold': !!sg.bold,
  'md-italic': !!sg.italic,
  'md-inline-code': !!sg.code
})

const userStore = useUserStore()

// 消息列表与加载状态
const messages = ref<ChatMessage[]>([])
const inputContent = ref('')
const isGenerating = ref(false)
const isLoadingHistory = ref(false)
const recommendedFaqs = ref<AiFaqItem[]>([])
const scrollIntoViewId = ref('')
const currentAbortController = ref<{ abort: () => void } | null>(null)

// 格式化时间
const formatTime = () => {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// 页面加载获取历史对话记录
const fetchChatHistory = async () => {
  // 加载期间用户可能已抢发消息，历史返回后必须保留这些本地消息，否则会覆盖掉正在流式生成的回答
  const pendingLocal = messages.value.slice()
  try {
    isLoadingHistory.value = true
    const token = uni.getStorageSync('student_token')
    const params: Record<string, any> = { limit: 50 }
    if (!token && userStore.userInfo?.studentNo) {
      params.simulateStudentNo = userStore.userInfo.studentNo
    }
    const historyList = await getChatHistoryApi(params)
    if (historyList && historyList.length > 0) {
      const formatted: ChatMessage[] = historyList.map(item => ({
        id: String(item.id),
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content,
        source: item.source,
        isStreaming: false,
        toolCall: item.toolCall ? {
          toolName: item.toolCall.toolName,
          description: item.toolCall.description,
          status: item.toolCall.status,
          arguments: item.toolCall.arguments,
          resultFactJson: item.toolCall.resultFactJson,
          executionTimeMs: item.toolCall.executionTimeMs
        } : undefined,
        time: item.time || (item.createTime ? item.createTime.substring(11, 16) : formatTime())
      }))
      messages.value = [...formatted, ...pendingLocal]
      forceScrollToBottom()
    }
  } catch (e) {
    console.error('加载历史消息失败', e)
  } finally {
    isLoadingHistory.value = false
  }
}

// 页面加载获取推荐问题
const fetchRecommendedFaqs = async () => {
  try {
    const list = await getRecommendedFaqsApi(6)
    recommendedFaqs.value = list || []
  } catch (err) {
    // 默认内置兜底快捷问题
    recommendedFaqs.value = [
      { id: 1, category: 'SCORE', question: '如何获得积分？', keywords: '积分' },
      { id: 2, category: 'ACTIVITY', question: '为什么扫码打卡会失败？', keywords: '打卡' },
      { id: 3, category: 'ACTIVITY', question: '活动名额满员怎么候补？', keywords: '候补' },
      { id: 4, category: 'GIFT', question: '兑换礼品后如何线下核销提货？', keywords: '礼品' }
    ]
  }
}

// 流式期间的节流滚动：scroll-into-view 同值不触发，需经 forceScrollToBottom 空值中转
let scrollThrottleTimer: any = null
const scrollToBottom = () => {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => {
    scrollThrottleTimer = null
    forceScrollToBottom()
  }, 60)
}

const forceScrollToBottom = () => {
  nextTick(() => {
    if (messages.value.length > 0) {
      scrollIntoViewId.value = ''
      nextTick(() => {
        if (messages.value.length > 0) {
          scrollIntoViewId.value = `msg-${messages.value[messages.value.length - 1].id}`
        }
      })
    }
  })
}

// 清空当前对话
const handleClearChat = () => {
  uni.showModal({
    title: '清空会话',
    content: '确定要清空与小智的全部对话记录吗？数据库历史记录也将同步清除。',
    confirmText: '清空',
    confirmColor: '#ef4444',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        if (isGenerating.value && currentAbortController.value) {
          currentAbortController.value.abort()
          isGenerating.value = false
        }
        try {
          const token = uni.getStorageSync('student_token')
          const params: Record<string, any> = {}
          if (!token && userStore.userInfo?.studentNo) {
            params.simulateStudentNo = userStore.userInfo.studentNo
          }
          await clearChatHistoryApi(params)
          messages.value = []
          uni.showToast({ title: '会话已清空', icon: 'none' })
        } catch (e: any) {
          uni.showToast({ title: e?.message || '清空失败，请重试', icon: 'none' })
        }
      }
    }
  })
}

// 停止生成
const handleStopGeneration = () => {
  if (currentAbortController.value) {
    currentAbortController.value.abort()
    currentAbortController.value = null
  }
  isGenerating.value = false
  if (messages.value.length > 0) {
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg.role === 'assistant') {
      lastMsg.isStreaming = false
    }
  }
  uni.showToast({ title: '已停止回答生成', icon: 'none' })
}

// 快捷点击推荐问题发送
const handleSelectFaq = (faq: AiFaqItem) => {
  if (isGenerating.value) return
  sendMessage(faq.question)
}

// 发送消息核心逻辑 (SSE 流式长连接接收)
const sendMessage = async (questionText?: string) => {
  const text = (questionText || inputContent.value).trim()
  if (!text || isGenerating.value) return

  inputContent.value = ''

  // 1. 追加学生提问气泡
  const userMsgId = 'u_' + Date.now()
  messages.value.push({
    id: userMsgId,
    role: 'user',
    content: text,
    time: formatTime()
  })
  forceScrollToBottom()

  // 2. 准备 AI 助手回答气泡 (使用 reactive 响应式对象封装，确保每一帧流式更新即时触发 Vue 3 渲染)
  const assistantMsgId = 'a_' + Date.now()
  const assistantMsg = reactive<ChatMessage>({
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    source: '',
    isStreaming: true,
    time: formatTime()
  })
  messages.value.push(assistantMsg)
  forceScrollToBottom()

  isGenerating.value = true
  // 声明在 try 之外：catch 块需要读取它来区分"用户主动中断"与"网络异常"
  let isManualAbort = false

  // 3. 构建原生 Fetch SSE 请求
  try {
    const token = uni.getStorageSync('student_token')

    // 动态解析后端地址 (H5 环境直接使用同源相对路径 /api，彻底规避跨域与本地 8080 端口冲突)
    let baseUrl = ''
    // #ifdef H5
    baseUrl = '/api'
    // #endif
    // #ifndef H5
    const custom = uni.getStorageSync('api_base_url')
    baseUrl = custom || (import.meta.env.VITE_APP_BASE_URL as string) || 'http://localhost:8080/api'
    // #endif

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (token) {
      headers['satoken'] = token
    }

    const payload: Record<string, any> = { question: text }

    const processSSELine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) return

      if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') {
        assistantMsg.isStreaming = false
        return
      }

      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.substring(5).trim()
        try {
          const data = JSON.parse(jsonStr)
          if (data.content) {
            assistantMsg.content += data.content
          }
          if (data.source) {
            assistantMsg.source = data.source
          }
          if (data.toolCall) {
            assistantMsg.toolCall = {
              toolName: data.toolCall.toolName,
              description: data.toolCall.description,
              status: data.toolCall.status,
              arguments: data.toolCall.argumentsJson || data.toolCall.arguments,
              resultFactJson: data.toolCall.resultFactJson,
              executionTimeMs: data.toolCall.executionTimeMs
            }
          }
          if (data.finish) {
            assistantMsg.isStreaming = false
          }
          scrollToBottom()
        } catch (e) {
          // 忽略碎片 json 解析异常
        }
      }
    }

    // #ifdef H5
    const controller = new AbortController()
    currentAbortController.value = {
      abort: () => {
        isManualAbort = true
        controller.abort()
      }
    }

    const response = await fetch(`${baseUrl}/ai/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`HTTP 状态异常: ${response.status}`)
    }

    if (!response.body) {
      throw new Error('未获取到可读流响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        processSSELine(line)
      }
    }
    // #endif

    // #ifndef H5
    await new Promise<void>((resolve, reject) => {
      let chunkBuffer = ''
      let pendingBytes: number[] = []
      let hasReceivedChunks = false

      // 流式 UTF-8 解码：保留未收齐的多字节尾部，彻底杜绝跨块中文乱码或 URIError 崩溃
      const decodeStreamBytes = (uint8: Uint8Array): string => {
        const allBytes = pendingBytes.length > 0
          ? new Uint8Array([...pendingBytes, ...uint8])
          : uint8
        pendingBytes = []

        let validEnd = allBytes.length
        for (let i = Math.max(0, allBytes.length - 4); i < allBytes.length; i++) {
          const byte = allBytes[i]
          let needed = 0
          if ((byte & 0x80) === 0) {
            needed = 1
          } else if ((byte & 0xE0) === 0xC0) {
            needed = 2
          } else if ((byte & 0xF0) === 0xE0) {
            needed = 3
          } else if ((byte & 0xF8) === 0xF0) {
            needed = 4
          }
          if (needed > 0 && i + needed > allBytes.length) {
            pendingBytes = Array.from(allBytes.subarray(i))
            validEnd = i
            break
          }
        }

        if (validEnd === 0) return ''
        const slice = allBytes.subarray(0, validEnd)
        if (typeof TextDecoder !== 'undefined') {
          return new TextDecoder('utf-8').decode(slice)
        } else {
          try {
            let str = ''
            for (let i = 0; i < slice.length; i++) {
              str += String.fromCharCode(slice[i])
            }
            return decodeURIComponent(escape(str))
          } catch {
            return ''
          }
        }
      }

      const requestTask = uni.request({
        url: `${baseUrl}/ai/chat/stream`,
        method: 'POST',
        header: headers,
        data: payload,
        enableChunked: true,
        responseType: 'text',
        success: (res) => {
          // 若已通过 onChunkReceived 接收流式数据，不再重复解析全量数据，防止内容重复追加
          if (!hasReceivedChunks && typeof res.data === 'string' && res.data.includes('data:')) {
            const lines = res.data.split('\n')
            for (const line of lines) {
              processSSELine(line)
            }
          }
          resolve()
        },
        fail: (err) => {
          reject(err)
        }
      })

      currentAbortController.value = {
        abort: () => {
          isManualAbort = true
          requestTask.abort()
        }
      }

      if (typeof (requestTask as any).onChunkReceived === 'function') {
        (requestTask as any).onChunkReceived((chunkRes: any) => {
          hasReceivedChunks = true
          let textChunk = ''
          if (typeof chunkRes.data === 'string') {
            textChunk = chunkRes.data
          } else if (chunkRes.data instanceof ArrayBuffer) {
            textChunk = decodeStreamBytes(new Uint8Array(chunkRes.data))
          }

          chunkBuffer += textChunk
          const lines = chunkBuffer.split('\n')
          chunkBuffer = lines.pop() || ''
          for (const line of lines) {
            processSSELine(line)
          }
        })
      }
    })
    // #endif
  } catch (err: any) {
    if (isManualAbort || err?.name === 'AbortError' || err?.errMsg?.includes('abort')) {
      // 用户主动中断：保留已生成的内容，不追加错误文案
    } else {
      assistantMsg.content += (assistantMsg.content ? '\n\n' : '') +
        '⚠️ 【网络连接提示】小助手未能及时收到服务器回复，请检查网络或稍后重试。'
      uni.showToast({ title: '连接中断或超时', icon: 'none' })
    }
  } finally {
    assistantMsg.isStreaming = false
    isGenerating.value = false
    currentAbortController.value = null
    forceScrollToBottom()
  }
}

// 快速输入查积分等快捷指令
const handleQuickAsk = (cmd: string) => {
  if (isGenerating.value) return
  sendMessage(cmd)
}

const goToLogin = () => {
  uni.navigateTo({ url: '/pages/login/index' })
}

onMounted(() => {
  fetchRecommendedFaqs()
  fetchChatHistory()
})

onUnmounted(() => {
  if (currentAbortController.value) {
    currentAbortController.value.abort()
  }
})
</script>

<template>
  <view class="ai-chat-page">
    <!-- 在线状态细条
         原方案是第二层深色横条（与导航栏同色），首屏被两层深色压掉约 12%。
         改为白底浅色 + 压缩高度 + 弱化文案层级：在线状态用绿色点表达，
         "双通道保障"降级为灰色小字，视觉上只保留导航栏一层深色。 -->
    <view class="header-status-bar">
      <view class="status-left">
        <view class="pulse-dot"></view>
        <text class="status-title">在线</text>
        <text class="status-sep">·</text>
        <text class="status-sub">知识库 + 大模型双通道</text>
      </view>
      <button class="action-btn" @click="handleClearChat">
        <app-icon name="trash" :size="24" color="#64748b" />
        <text class="action-text">清空</text>
      </button>
    </view>

    <!-- 消息流滚动列表 -->
    <scroll-view
      class="chat-scroll-view"
      scroll-y
      :scroll-into-view="scrollIntoViewId"
      scroll-with-animation
    >
      <!-- 首次进入迎宾引导卡片（历史加载完成前不渲染，避免欢迎卡闪现后跳变） -->
      <view class="welcome-card" v-if="!isLoadingHistory && messages.length === 0">
        <view class="bot-avatar-large">
          <app-icon name="bot" :size="72" color="#2563eb" stroke-width="1.6" />
        </view>
        <text class="welcome-title">你好，同学！我是小智</text>
        <text class="welcome-desc">
          我是校园活动积分平台的 AI 智能小助理。我可以为您解答
          <text class="highlight">活动报名、动态码打卡、GPS定位规则、积分兑换商城</text> 等问题。
        </text>

        <!-- 登录态个性化提示 -->
        <view class="personal-hint-box" v-if="userStore.isLoggedIn">
          <app-icon name="sparkles" :size="26" color="#2563eb" />
          <text class="hint-text">
            已识别学生学籍【{{ userStore.userInfo?.name || '同学' }} ({{ userStore.userInfo?.studentNo }})】，可直接查询积分、活动、提货码！
          </text>
        </view>
        <view class="personal-hint-box unlogin" v-else @click="goToLogin">
          <app-icon name="graduate" :size="26" color="#2563eb" />
          <text class="hint-text">
            当前未登录，个人数据查询需要先登录。<text class="link-text">点此登录个人账号</text>
          </text>
        </view>

        <!-- 常用快捷提问胶囊 -->
        <view class="recommend-title">
          <app-icon name="sparkles" :size="24" color="#f59e0b" />
          <text>大家都在问：</text>
        </view>
        <view class="faq-chips-grid">
          <view
            v-for="faq in recommendedFaqs"
            :key="faq.id"
            class="faq-chip"
            @click="handleSelectFaq(faq)"
          >
            <text class="chip-cat" :class="faq.category.toLowerCase()">
              {{ faq.category === 'SCORE' ? '积分' : faq.category === 'ACTIVITY' ? '活动' : faq.category === 'GIFT' ? '礼品' : '规则' }}
            </text>
            <text class="chip-text">{{ faq.question }}</text>
          </view>
          <!-- 快捷真实数据指令 -->
          <view class="faq-chip personal-chip" @click="handleQuickAsk('我当前还剩多少积分？')">
            <text class="chip-cat personal">本人</text>
            <text class="chip-text">我当前还剩多少积分？</text>
          </view>
          <view class="faq-chip personal-chip" @click="handleQuickAsk('我兑换的礼品发货了吗？')">
            <text class="chip-cat personal">本人</text>
            <text class="chip-text">我兑换的礼品发货了吗？</text>
          </view>
        </view>
      </view>

      <!-- 历史记录加载占位 -->
      <view class="history-loading" v-else-if="isLoadingHistory && messages.length === 0">
        <app-icon name="bot" :size="56" color="#cbd5e1" stroke-width="1.5" />
        <text class="history-loading-txt">正在载入历史会话...</text>
      </view>

      <!-- 消息气泡流 -->
      <view class="message-list" v-else>
        <view
          v-for="msg in messages"
          :key="msg.id"
          :id="'msg-' + msg.id"
          class="message-row"
          :class="msg.role"
        >
          <!-- 机器人头像 -->
          <view class="msg-avatar" v-if="msg.role === 'assistant'">
            <app-icon name="bot" :size="40" color="#ffffff" />
          </view>

          <!-- 气泡正文 -->
          <view class="msg-bubble-wrap">
            <!-- 来源标签 (知识库/大模型/工具调度) -->
            <view class="msg-source-tag" v-if="msg.role === 'assistant' && msg.source">
              <text v-if="msg.source === 'KNOWLEDGE_BASE'" class="source-pill kb">官方权威解答</text>
              <text v-else-if="msg.source === 'TOOL_AGENT'" class="source-pill tool">Function Calling 智能调度</text>
              <text v-else-if="msg.source === 'LOCAL_AGENT'" class="source-pill synth">本地智能工具引擎</text>
              <text v-else-if="msg.source === 'SENSENOVA'" class="source-pill ai">商汤 SenseNova 6.8</text>
              <text v-else-if="msg.source === 'QWEN'" class="source-pill ai">通义千问 Qwen 3.8</text>
              <text v-else class="source-pill ai">AI 智能推理</text>
            </view>

            <!-- Function Calling 状态指示卡片（区分调用中/成功/失败，失败不得宣称已调取事实） -->
            <view
              class="msg-tool-chip"
              :class="{ failed: msg.toolCall && msg.toolCall.status === 'FAILED' }"
              v-if="msg.role === 'assistant' && msg.toolCall"
            >
              <app-icon name="zap" :size="24" :color="msg.toolCall.status === 'FAILED' ? '#b91c1c' : '#0284c7'" />
              <text class="tool-chip-text">
                {{ toolChipText(msg.toolCall) }}
              </text>
              <text class="tool-chip-time" v-if="msg.toolCall.executionTimeMs">{{ msg.toolCall.executionTimeMs }}ms</text>
            </view>

            <view class="msg-bubble" :class="msg.role">
              <!-- 助手回复：按 Markdown 结构渲染（标题/加粗/列表/引用/代码/表格） -->
              <template v-if="msg.role === 'assistant'">
                <view
                  v-for="(ln, li) in mdLinesOf(msg)"
                  :key="li"
                  class="md-line"
                  :class="ln.cls"
                >
                  <view v-if="ln.cls === 'md-hr'" class="md-hr-bar"></view>

                  <text v-else-if="ln.cls === 'md-code-block'" class="md-code-text" :selectable="true">{{ ln.raw }}</text>

                  <view v-else-if="ln.cells" class="md-tr-inner">
                    <text
                      v-for="(cell, ci) in ln.cells"
                      :key="ci"
                      class="md-td"
                      :class="{ 'md-th': ln.header }"
                    ><text v-for="(sg, si) in cell" :key="si" :class="segCls(sg)">{{ sg.text }}</text></text>
                  </view>

                  <template v-else>
                    <text v-if="ln.bullet" class="md-bullet">{{ ln.bullet }}</text>
                    <text class="md-text" :selectable="true"><text v-for="(sg, si) in ln.segs" :key="si" :class="segCls(sg)">{{ sg.text }}</text></text>
                  </template>
                </view>
              </template>

              <!-- 学生消息：保持纯文本 -->
              <text v-else class="bubble-text" :selectable="true">{{ msg.content }}</text>

              <text class="typing-cursor" v-if="msg.isStreaming"></text>
            </view>

            <text class="msg-time">{{ msg.time }}</text>
          </view>

          <!-- 学生用户头像 -->
          <!-- 学生头像：优先使用本人上传的真实头像 -->
          <view class="msg-avatar user-avatar" v-if="msg.role === 'user'">
            <image
              v-if="userStore.userInfo?.avatar"
              class="msg-avatar-img"
              :src="resolveImageUrl(userStore.userInfo.avatar)"
              mode="aspectFill"
            />
            <app-icon v-else name="graduate" :size="40" color="#ffffff" />
          </view>
        </view>
      </view>

      <!-- 底部撑开安全距离 -->
      <view class="scroll-bottom-padding"></view>
    </scroll-view>

    <!-- 底部常驻交互操作栏 -->
    <view class="chat-footer-bar">
      <!-- 快捷胶囊滑动条 (有消息时仍然提供快捷追问) -->
      <scroll-view class="horizontal-prompts-bar" scroll-x v-if="messages.length > 0 && !isGenerating">
        <view class="prompts-wrap">
          <view class="prompt-pill" @click="handleQuickAsk('我当前还剩多少积分？')">
            <app-icon name="coins" :size="24" color="#f59e0b" /><text>查可用积分</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('我参与过哪些活动？')">
            <app-icon name="calendar" :size="24" color="#2563eb" /><text>查我的活动</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('如何获得活动积分？')">
            <app-icon name="file-text" :size="24" color="#10b981" /><text>积分规则</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('打卡超出范围怎么办？')">
            <app-icon name="map-pin" :size="24" color="#ef4444" /><text>定位打卡帮助</text>
          </view>
        </view>
      </scroll-view>

      <!-- 正在生成状态条与停止按钮 -->
      <view class="generating-control-bar" v-if="isGenerating">
        <view class="generating-status">
          <view class="spin-loader"></view>
          <text class="gen-text">小智正在逐字推断生成中...</text>
        </view>
        <button class="stop-gen-btn" @click="handleStopGeneration">
          <text class="stop-icon">⏹</text>
          <text>停止生成</text>
        </button>
      </view>

      <!-- 输入框与发送区 -->
      <view class="input-controls-row">
        <textarea
          class="chat-input"
          v-model="inputContent"
          :auto-height="true"
          :maxlength="300"
          :disabled="isGenerating"
          placeholder="问问小智：关于积分、活动、打卡或礼品..."
          placeholder-class="input-placeholder"
          confirm-type="send"
          @confirm="() => sendMessage()"
        />
        <button
          class="send-btn"
          :class="{ active: inputContent.trim().length > 0 && !isGenerating }"
          :disabled="inputContent.trim().length === 0 || isGenerating"
          @click="() => sendMessage()"
        >
          <app-icon name="send" :size="34" :color="inputContent.trim().length > 0 && !isGenerating ? '#ffffff' : '#64748b'" />
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.ai-chat-page {
  display: flex;
  flex-direction: column;
  /* H5 端 uni-app 会渲染原生导航栏并把内容整体下移，直接用 100vh 会让页面比视口高出
     一个导航栏的高度，底部输入框被裁掉（实测 footer 底部超出视口 44px）。
     减去 --window-top（H5 为导航栏高度，小程序端为 0）后两端一致。 */
  height: calc(100vh - var(--window-top));
  background-color: #f8fafc;
  box-sizing: border-box;
}

/* 在线状态细条（白底浅色，与导航栏形成层级差异，而非叠加第二层深色） */
.header-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 24rpx;
  background-color: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.pulse-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: #10b981;
  flex-shrink: 0;
  animation: pulseAnim 2.4s infinite ease-in-out;
}

/* 只用透明度呼吸，比缩放更含蓄，避免在静态界面上抢注意力 */
@keyframes pulseAnim {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.status-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #10b981;
}

.status-sep {
  font-size: 22rpx;
  color: #cbd5e1;
}

.status-sub {
  font-size: 22rpx;
  color: #94a3b8;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  background-color: transparent;
  border: none;
  padding: 4rpx 10rpx;
  border-radius: 20rpx;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}

.action-btn:active {
  background-color: #f1f5f9;
}

.action-text {
  font-size: 22rpx;
}

/* 消息流区域 */
.chat-scroll-view {
  flex: 1;
  height: 0;
  padding: 24rpx 24rpx 10rpx;
  box-sizing: border-box;
}

/* 迎宾卡片 */
.welcome-card {
  background-color: #ffffff;
  border-radius: 24rpx;
  padding: 36rpx 28rpx;
  margin: 16rpx 8rpx 32rpx;
  box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.05);
  border: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.bot-avatar-large {
  position: relative;
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(59, 130, 246, 0.35);
}


.welcome-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 12rpx;
}

.welcome-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
  margin-bottom: 24rpx;
}

.welcome-desc .highlight {
  color: #2563eb;
  font-weight: 600;
}

.personal-hint-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border: 1px solid #bfdbfe;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 28rpx;
  text-align: left;
}


.hint-text {
  font-size: 22rpx;
  color: #1e40af;
  line-height: 1.4;
}

.personal-hint-box.unlogin {
  background: linear-gradient(135deg, #fefce8 0%, #fff7ed 100%);
  border: 1px solid #fed7aa;
  cursor: pointer;
}

.personal-hint-box.unlogin .hint-text {
  color: #9a3412;
}

.personal-hint-box .link-text {
  color: #2563eb;
  text-decoration: underline;
  margin-left: 8rpx;
  font-weight: 600;
}

.recommend-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  align-self: flex-start;
  font-size: 24rpx;
  font-weight: 700;
  color: #334155;
  margin-bottom: 16rpx;
}

.faq-chips-grid {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  width: 100%;
}

.faq-chip {
  display: flex;
  align-items: center;
  gap: 14rpx;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  text-align: left;
  transition: all 0.2s ease;
}

.faq-chip:active {
  background-color: #f1f5f9;
  transform: scale(0.99);
}

.chip-cat {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 10rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.chip-cat.score { background-color: #fef3c7; color: #b45309; }
.chip-cat.activity { background-color: #e0f2fe; color: #0369a1; }
.chip-cat.gift { background-color: #fce7f3; color: #be185d; }
.chip-cat.rule { background-color: #f3e8ff; color: #7e22ce; }
.chip-cat.personal { background-color: #dcfce7; color: #15803d; }

.chip-text {
  font-size: 24rpx;
  color: #1e293b;
  font-weight: 500;
  flex: 1;
}

/* 消息行 */
.message-list {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  max-width: 90%;
}

.message-row.user {
  align-self: flex-end;
  /* DOM 顺序已是「气泡 → 头像」，用默认 row 就能让头像落在气泡右侧。
     此前误加 row-reverse 会把头像推到气泡左边，与「自己的消息靠右」的对话语义相反。 */
  flex-direction: row;
  justify-content: flex-end;
}

.message-row.assistant {
  align-self: flex-start;
}

.msg-avatar {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4rpx 12rpx rgba(59, 130, 246, 0.25);
  overflow: hidden;
}
.msg-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.history-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 120rpx 0;
}
.history-loading-txt {
  font-size: 24rpx;
  color: #94a3b8;
}
.msg-tool-chip.failed {
  background-color: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.user-avatar {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  box-shadow: 0 4rpx 12rpx rgba(14, 165, 233, 0.25);
}


.msg-bubble-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  /* 允许 flex 子项收缩，否则长文本/表格会把气泡撑破容器 */
  min-width: 0;
  /* 行宽已由 .message-row 的 max-width 限制，这里不再叠加百分比，
     否则两层 max-width 相乘（90% × 82%）会让气泡只有约 74% 宽，长回复被挤成细条 */
  max-width: 100%;
}

.message-row.user .msg-bubble-wrap {
  align-items: flex-end;
}

.msg-source-tag {
  margin-bottom: 6rpx;
}

.source-pill {
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  font-weight: 600;
}

.source-pill.kb {
  background-color: #d1fae5;
  color: #065f46;
}

.source-pill.tool {
  background-color: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.source-pill.synth {
  background-color: #e0e7ff;
  color: #3730a3;
}

.source-pill.ai {
  background-color: #f1f5f9;
  color: #475569;
}

.msg-tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12rpx;
  padding: 8rpx 14rpx;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  color: #475569;
}


.tool-chip-text {
  font-size: 22rpx;
  color: #334155;
}

.tool-chip-time {
  font-size: 20rpx;
  color: #64748b;
  background: #e2e8f0;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
}

.msg-bubble {
  padding: 20rpx 26rpx;
  border-radius: 22rpx;
  font-size: 26rpx;
  line-height: 1.6;
  word-break: break-word;
}

.msg-bubble.user {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  border-top-right-radius: 6rpx;
  box-shadow: 0 4rpx 14rpx rgba(37, 99, 235, 0.25);
}

.msg-bubble.assistant {
  background-color: #ffffff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-top-left-radius: 6rpx;
  box-shadow: 0 2rpx 10rpx rgba(15, 23, 42, 0.04);
}

.bubble-text {
  white-space: pre-wrap;
}

/* ==================== 助手消息 Markdown 渲染 ==================== */
.md-line {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  width: 100%;
}

.md-line + .md-line {
  margin-top: 10rpx;
}

.md-text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  line-height: 1.7;
  color: #1e293b;
  word-break: break-word;
}

/* 标题层级：用字重与留白拉开层次，而不是靠更多颜色 */
.md-h {
  font-weight: 700;
  color: #0f172a;
  line-height: 1.5;
}
.md-h1 { font-size: 34rpx; margin-top: 16rpx; }
.md-h2 { font-size: 32rpx; margin-top: 14rpx; }
.md-h3 { font-size: 30rpx; margin-top: 12rpx; }
.md-h4 { font-size: 28rpx; margin-top: 10rpx; }
.md-line.md-h:first-child { margin-top: 0; }

/* 段落 */
.md-p {
  font-size: 28rpx;
  line-height: 1.7;
  color: #1e293b;
}

/* 列表 */
.md-li {
  padding-left: 2rpx;
}
.md-bullet {
  flex-shrink: 0;
  font-size: 28rpx;
  line-height: 1.7;
  color: #3b82f6;
  margin-right: 12rpx;
  font-weight: 700;
}

/* 引用块 */
.md-quote {
  border-left: 6rpx solid #93c5fd;
  background-color: #f8fafc;
  border-radius: 0 10rpx 10rpx 0;
  padding: 10rpx 16rpx;
  margin: 6rpx 0;
}

/* 分隔线 */
.md-hr-bar {
  width: 100%;
  height: 2rpx;
  background-color: #e2e8f0;
  margin: 14rpx 0;
}

/* 行内代码 */
.md-inline-code {
  background-color: #f1f5f9;
  color: #1d4ed8;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  font-size: 26rpx;
}

/* 代码块 */
.md-code-block {
  display: block;
  width: 100%;
  background-color: #0f172a;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
}
.md-code-text {
  font-size: 24rpx;
  line-height: 1.65;
  color: #e2e8f0;
  word-break: break-all;
  white-space: pre-wrap;
}

/* 强调 */
.md-bold { font-weight: 700; color: #0f172a; }
.md-italic { font-style: italic; color: #64748b; }

/* 表格 */
.md-tr {
  display: block;
  margin: 4rpx 0;
}
.md-tr-inner {
  display: flex;
  flex-direction: row;
  width: 100%;
  border-bottom: 1rpx solid #e2e8f0;
}
.md-tr-head .md-tr-inner {
  border-bottom: 1rpx solid #cbd5e1;
}
.md-td {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.6;
  padding: 8rpx 8rpx;
  color: #334155;
  word-break: break-word;
}
.md-th {
  font-weight: 700;
  color: #0f172a;
  background-color: #f1f5f9;
}
.md-th.md-td {
  border-radius: 6rpx 6rpx 0 0;
}

/* 打字机闪烁光标 */
.typing-cursor {
  display: inline-block;
  width: 4rpx;
  height: 28rpx;
  background-color: #2563eb;
  margin-left: 6rpx;
  vertical-align: middle;
  animation: cursorBlink 0.8s infinite;
}

@keyframes cursorBlink {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

.msg-time {
  font-size: 20rpx;
  color: #94a3b8;
  margin-top: 6rpx;
  padding: 0 6rpx;
}

.scroll-bottom-padding {
  height: 20rpx;
}

/* 底部交互区 */
.chat-footer-bar {
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  padding: 16rpx 24rpx 36rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  flex-shrink: 0;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.03);
}

.horizontal-prompts-bar {
  white-space: nowrap;
}

.prompts-wrap {
  display: flex;
  gap: 14rpx;
  padding: 4rpx 0;
}

.prompt-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: #475569;
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 10rpx 20rpx;
  border-radius: 24rpx;
  font-weight: 500;
  flex-shrink: 0;
}

.prompt-pill:active {
  background-color: #e2e8f0;
}

/* 正在生成提示栏 */
.generating-control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 16rpx;
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 16rpx;
}

.generating-status {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.spin-loader {
  width: 24rpx;
  height: 24rpx;
  border: 4rpx solid #bbf7d0;
  border-top-color: #16a34a;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.gen-text {
  font-size: 22rpx;
  color: #166534;
  font-weight: 500;
}

.stop-gen-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background-color: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
  border-radius: 20rpx;
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 18rpx;
  margin: 0;
  line-height: 1.4;
}

/* 输入控制行 */
.input-controls-row {
  display: flex;
  align-items: flex-end;
  gap: 16rpx;
}

.chat-input {
  flex: 1;
  background-color: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 20rpx;
  padding: 16rpx 22rpx;
  font-size: 26rpx;
  line-height: 1.5;
  min-height: 72rpx;
  max-height: 160rpx;
  color: #0f172a;
  box-sizing: border-box;
}

.input-placeholder {
  color: #94a3b8;
  font-size: 24rpx;
}

.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #cbd5e1;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  margin: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.08);
}

.send-btn.active {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 4rpx 14rpx rgba(37, 99, 235, 0.35);
}

</style>
