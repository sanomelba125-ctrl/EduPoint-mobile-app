<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { getRecommendedFaqsApi, type AiFaqItem } from '@/api/ai'
import { useUserStore } from '@/stores'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  source?: string
  isStreaming?: boolean
  time: string
}

const userStore = useUserStore()

// 消息列表与加载状态
const messages = ref<ChatMessage[]>([])
const inputContent = ref('')
const isGenerating = ref(false)
const recommendedFaqs = ref<AiFaqItem[]>([])
const scrollIntoViewId = ref('')
const currentAbortController = ref<AbortController | null>(null)

// 格式化时间
const formatTime = () => {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
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

// 自动滚动到消息列表底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messages.value.length > 0) {
      scrollIntoViewId.value = `msg-${messages.value[messages.value.length - 1].id}`
    }
  })
}

// 清空当前对话
const handleClearChat = () => {
  uni.showModal({
    title: '清空会话',
    content: '确定要清空与小智的全部对话记录吗？',
    confirmText: '清空',
    confirmColor: '#ef4444',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        if (isGenerating.value && currentAbortController.value) {
          currentAbortController.value.abort()
          isGenerating.value = false
        }
        messages.value = []
        uni.showToast({ title: '会话已清空', icon: 'none' })
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
  scrollToBottom()

  // 2. 准备 AI 助手回答气泡
  const assistantMsgId = 'a_' + Date.now()
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    source: '',
    isStreaming: true,
    time: formatTime()
  }
  messages.value.push(assistantMsg)
  scrollToBottom()

  isGenerating.value = true

  // 3. 构建原生 Fetch SSE 请求
  try {
    const token = uni.getStorageSync('student_token')
    const controller = new AbortController()
    currentAbortController.value = controller

    // 优先读取 BASE_URL 环境变量或默认本地端口
    const baseUrl = 'http://localhost:8080/api'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (token) {
      headers['satoken'] = token
    }

    const response = await fetch(`${baseUrl}/ai/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: text }),
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
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue

        if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') {
          assistantMsg.isStreaming = false
          break
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
            if (data.finish) {
              assistantMsg.isStreaming = false
            }
            scrollToBottom()
          } catch (e) {
            // 忽略碎片 json 解析异常
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logInfo('用户主动中断回答')
    } else {
      assistantMsg.content += (assistantMsg.content ? '\n\n' : '') +
        '⚠️ 【网络连接提示】小助手未能及时收到服务器回复，请检查网络或稍后重试。'
      uni.showToast({ title: '连接中断或超时', icon: 'none' })
    }
  } finally {
    assistantMsg.isStreaming = false
    isGenerating.value = false
    currentAbortController.value = null
    scrollToBottom()
  }
}

const logInfo = (msg: string) => {
  // 打印调试日志
}

// 快速输入查积分等快捷指令
const handleQuickAsk = (cmd: string) => {
  if (isGenerating.value) return
  sendMessage(cmd)
}

onMounted(() => {
  fetchRecommendedFaqs()
})

onUnmounted(() => {
  if (currentAbortController.value) {
    currentAbortController.value.abort()
  }
})
</script>

<template>
  <view class="ai-chat-page">
    <!-- 顶部状态栏提示 -->
    <view class="header-status-bar">
      <view class="status-left">
        <view class="pulse-dot"></view>
        <text class="status-title">校园助手小智</text>
        <text class="status-badge">双通道保障</text>
      </view>
      <view class="status-actions">
        <button class="action-btn" @click="handleClearChat" title="清空对话">
          <text class="action-icon">🗑️</text>
          <text class="action-text">清空</text>
        </button>
      </view>
    </view>

    <!-- 消息流滚动列表 -->
    <scroll-view
      class="chat-scroll-view"
      scroll-y
      :scroll-into-view="scrollIntoViewId"
      scroll-with-animation
    >
      <!-- 首次进入迎宾引导卡片 -->
      <view class="welcome-card" v-if="messages.length === 0">
        <view class="bot-avatar-large">
          <text class="bot-icon">🤖</text>
          <view class="bot-ring"></view>
        </view>
        <text class="welcome-title">你好，同学！我是小智</text>
        <text class="welcome-desc">
          我是校园活动积分平台的 AI 智能小助理。我可以为您解答
          <text class="highlight">活动报名、动态码打卡、GPS定位规则、积分兑换商城</text> 等问题。
        </text>

        <!-- 登录态个性化提示 -->
        <view class="personal-hint-box" v-if="userStore.isLoggedIn">
          <text class="hint-icon">✨</text>
          <text class="hint-text">
            已检测到您的学生登录身份，您可以直接询问“我还有多少积分”、“我的礼品发货了吗”！
          </text>
        </view>

        <!-- 常用快捷提问胶囊 -->
        <view class="recommend-title">
          <text class="rec-icon">💡</text>
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
            <text class="avatar-emoji">🤖</text>
          </view>

          <!-- 气泡正文 -->
          <view class="msg-bubble-wrap">
            <!-- 来源标签 (知识库/大模型) -->
            <view class="msg-source-tag" v-if="msg.role === 'assistant' && msg.source">
              <text v-if="msg.source === 'KNOWLEDGE_BASE'" class="source-pill kb">官方权威解答</text>
              <text v-else-if="msg.source === 'LOCAL_SYNTHESIS'" class="source-pill synth">个人业务实时核对</text>
              <text v-else class="source-pill ai">AI 智能推理</text>
            </view>

            <view class="msg-bubble" :class="msg.role">
              <text class="bubble-text" :selectable="true">{{ msg.content }}</text>
              <!-- 打字机跳动光标 -->
              <text class="typing-cursor" v-if="msg.isStreaming"></text>
            </view>

            <text class="msg-time">{{ msg.time }}</text>
          </view>

          <!-- 学生用户头像 -->
          <view class="msg-avatar user-avatar" v-if="msg.role === 'user'">
            <text class="avatar-emoji">🎓</text>
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
            <text>💰 查可用积分</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('我参与过哪些活动？')">
            <text>🚩 查我的活动</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('如何获得活动积分？')">
            <text>📋 积分规则</text>
          </view>
          <view class="prompt-pill" @click="handleQuickAsk('打卡超出范围怎么办？')">
            <text>📍 定位打卡帮助</text>
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
          <text class="send-arrow">➔</text>
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.ai-chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8fafc;
  box-sizing: border-box;
}

/* 顶部状态栏 */
.header-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #ffffff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.pulse-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 10rpx #10b981;
  animation: pulseAnim 2s infinite ease-in-out;
}

@keyframes pulseAnim {
  0% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.8; }
}

.status-title {
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 0.5rpx;
}

.status-badge {
  font-size: 20rpx;
  color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.15);
  padding: 4rpx 12rpx;
  border-radius: 16rpx;
  font-weight: 500;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background-color: rgba(255, 255, 255, 0.12);
  border: none;
  padding: 6rpx 16rpx;
  border-radius: 24rpx;
  color: #cbd5e1;
  line-height: 1.4;
  margin: 0;
}

.action-icon {
  font-size: 22rpx;
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

.bot-icon {
  font-size: 52rpx;
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

.hint-icon {
  font-size: 28rpx;
  flex-shrink: 0;
}

.hint-text {
  font-size: 22rpx;
  color: #1e40af;
  line-height: 1.4;
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
  flex-direction: row-reverse;
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
}

.user-avatar {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  box-shadow: 0 4rpx 12rpx rgba(14, 165, 233, 0.25);
}

.avatar-emoji {
  font-size: 34rpx;
}

.msg-bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 82%;
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

.source-pill.synth {
  background-color: #e0e7ff;
  color: #3730a3;
}

.source-pill.ai {
  background-color: #f1f5f9;
  color: #475569;
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
  display: inline-block;
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

.send-arrow {
  font-size: 32rpx;
  line-height: 1;
}
</style>
