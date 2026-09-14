<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onHide, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores'
import {
  getActivityDetailApi,
  getActivityPageApi,
  checkinActivityApi,
  type ActivityItem,
  type CheckinResult
} from '@/api/activity'
import { getApiErrorMessage } from '@/utils/request'
import {
  getCurrentAMapLocation,
  getAMapDistance,
  isValidCoordinatePair,
} from '@/utils/amap'
// #ifdef H5
import jsQR from 'jsqr'
// #endif

const userStore = useUserStore()

const actId = ref<number>(1)
const activity = ref<ActivityItem | null>(null)
const flashActive = ref(false)
const checkingIn = ref(false)

// 摄像头与原生 WebRTC + jsQR 状态管理
let activeStream: MediaStream | null = null
let scanTimer: any = null
let canvasEl: HTMLCanvasElement | null = null
let canvasCtx: CanvasRenderingContext2D | null = null
let barcodeDetector: any = null

if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
  try {
    barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
  } catch (e) {
    barcodeDetector = null
  }
}

const cameraActive = ref(false)
const cameraLoading = ref(false)
const cameraError = ref('')
const camerasList = ref<{ id: string; label: string }[]>([])
const currentCameraIndex = ref(0)
const scanLocked = ref(false)

const activeCameraLabel = computed(() => {
  if (camerasList.value.length === 0) return ''
  const cur = camerasList.value[currentCameraIndex.value]
  return cur?.label || `镜头 ${currentCameraIndex.value + 1}`
})

// 电脑端模拟扫码：JSON / 文本输入框
const rawQrInput = ref<string>('')

// 当前考勤定位坐标与逆地理编码详细地址
const currentLat = ref<number | null>(null)
const currentLon = ref<number | null>(null)
const distanceToCenter = ref<number | null>(null)
const isWithinRadius = ref<boolean>(false)
const amapAddress = ref<string>('等待获取设备真实定位...')
const amapLoading = ref<boolean>(false)

// 成功弹窗
const showSuccessModal = ref(false)
const checkinResult = ref<CheckinResult | null>(null)

const loadActivity = async () => {
  try {
    const act = await getActivityDetailApi(actId.value)
    activity.value = act
    await updateGpsDistance(true)
  } catch (err: any) {
    console.warn(`加载活动 ${actId.value} 失败，尝试获取广场首项活动兜底...`, err)
    try {
      const pageRes = await getActivityPageApi({ page: 1, size: 5 })
      if (pageRes && pageRes.records && pageRes.records.length > 0) {
        const fallbackAct = pageRes.records[0]
        actId.value = fallbackAct.id
        activity.value = fallbackAct
        await updateGpsDistance(true)
        return
      }
    } catch {}
    uni.showToast({ title: err?.message || '加载活动信息失败', icon: 'none' })
  }
}

/**
 * 获取设备真实定位并进行逆地理编码与测距
 */
const updateGpsDistance = async (silent = false): Promise<boolean> => {
  if (!activity.value) return false
  amapLoading.value = true

  try {
    const loc = await getCurrentAMapLocation()

    currentLat.value = loc.latitude
    currentLon.value = loc.longitude
    amapAddress.value = loc.formattedAddress
    calcDist()
    return true
  } catch (err: any) {
    currentLat.value = null
    currentLon.value = null
    distanceToCenter.value = null
    isWithinRadius.value = false
    amapAddress.value = '未获取到真实定位，请开启定位权限后重试'
    if (!silent) {
      uni.showToast({ title: getApiErrorMessage(err, '获取定位失败'), icon: 'none' })
    }
    return false
  } finally {
    amapLoading.value = false
  }
}

const calcDist = () => {
  if (!activity.value || currentLat.value === null || currentLon.value === null) return
  const dist = getAMapDistance(
    currentLat.value,
    currentLon.value,
    activity.value.latitude,
    activity.value.longitude
  )
  distanceToCenter.value = dist
  isWithinRadius.value = !activity.value.locationCheckEnabled || dist <= (activity.value.locationRadius || 500)
}

const toggleFlashlight = async () => {
  // #ifdef H5
  if (activeStream && cameraActive.value) {
    const track = activeStream.getVideoTracks()[0]
    if (track && 'applyConstraints' in track) {
      try {
        flashActive.value = !flashActive.value
        await (track as any).applyConstraints({
          advanced: [{ torch: flashActive.value }]
        })
        uni.showToast({
          title: flashActive.value ? '补光灯已开启' : '补光灯已关闭',
          icon: 'none'
        })
        return
      } catch (e) {
        flashActive.value = false
        uni.showToast({ title: '当前摄像头硬件不支持补光灯', icon: 'none' })
        return
      }
    }
  }
  // #endif
  flashActive.value = !flashActive.value
  uni.showToast({
    title: flashActive.value ? '补光灯已开启' : '补光灯已关闭',
    icon: 'none'
  })
}

/**
 * 健壮的多格式二维码/JSON 解析器
 */
interface ParsedQrData {
  activityId: number
  nonce: string
  sign: string
}

const parseQrPayload = (qrRawText: string): ParsedQrData => {
  if (!qrRawText || typeof qrRawText !== 'string') {
    throw new Error('请输入或粘贴二维码解析出的 JSON 或文本')
  }

  let text = qrRawText.trim()
  // 去除最外层包裹的单引号或双引号
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }

  let nonce = ''
  let sign = ''
  let activityId: number | null = null

  // 1. 尝试 JSON 解析
  if (text.startsWith('{') || text.includes('"nonce"') || text.includes("'nonce'")) {
    try {
      const normalizedJson = text.replace(/'/g, '"')
      const parsed = JSON.parse(normalizedJson)
      if (parsed.nonce) nonce = String(parsed.nonce).trim()
      if (parsed.sign) sign = String(parsed.sign).trim()
      if (parsed.activityId) activityId = Number(parsed.activityId)
      else if (parsed.actId) activityId = Number(parsed.actId)
    } catch {
      // JSON 语法若不严格，尝试正则提取
      const nonceMatch = text.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/)
      const signMatch = text.match(/["']?sign["']?\s*:\s*["']([^"']+)["']/)
      const actIdMatch = text.match(/["']?(?:activityId|actId)["']?\s*:\s*["']?(\d+)["']?/)
      if (nonceMatch) nonce = nonceMatch[1].trim()
      if (signMatch) sign = signMatch[1].trim()
      if (actIdMatch) activityId = Number(actIdMatch[1])
    }
  }

  // 2. 尝试从 URL 或 QueryString 中提取
  if (!nonce || !sign) {
    try {
      const urlCandidate = text.startsWith('http') ? text : `http://localhost?${text}`
      const urlObj = new URL(urlCandidate)
      const n = urlObj.searchParams.get('nonce')
      const s = urlObj.searchParams.get('sign')
      const aid = urlObj.searchParams.get('actId') || urlObj.searchParams.get('activityId')
      if (n) nonce = n.trim()
      if (s) sign = s.trim()
      if (aid) activityId = Number(aid)
    } catch {}
  }

  // 3. 校验关键防伪信息
  if (!nonce || !sign) {
    throw new Error('未识别到有效的 nonce 或 sign 防伪签名，请检查 JSON 格式')
  }

  // 二维码必须明确绑定活动，不能用当前页面活动 ID 静默补齐。
  if (!activityId || isNaN(activityId) || activityId <= 0) {
    throw new Error('二维码缺少有效的 activityId，请重新获取该活动签到码')
  }

  return { activityId, nonce, sign }
}

/**
 * 点击“解析 JSON 并打卡”按钮
 */
const handleParseAndCheckinClick = () => {
  if (!rawQrInput.value.trim()) {
    uni.showToast({ title: '请先输入或粘贴 JSON 数据', icon: 'none' })
    return
  }

  try {
    const parsed = parseQrPayload(rawQrInput.value)

    // 震动与二维码识别成功提示（响应用户明确要求）
    try { uni.vibrateShort?.({}) } catch {}
    uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })

    setTimeout(() => {
      if (parsed.activityId !== actId.value) {
        uni.showToast({ title: `该签到码属于活动 ${parsed.activityId}，请进入对应活动打卡`, icon: 'none' })
        return
      }
      doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
    }, 400)
  } catch (err: any) {
    uni.showToast({ title: err?.message || 'JSON 解析失败，请检查格式', icon: 'none' })
  }
}

/**
 * 快捷填入当前活动示例 JSON
 */
const handleFillSampleJson = () => {
  const nonce = `NONCE_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
  const sign = `SIGN_${Math.random().toString(36).substring(2, 12).toUpperCase()}`
  rawQrInput.value = JSON.stringify({
    activityId: actId.value,
    nonce,
    sign
  }, null, 2)
  uni.showToast({ title: '已填入当前活动示例 JSON', icon: 'none' })
}

/**
 * 快捷填入完整扫码 URL 格式
 */
const handleFillSampleUrl = () => {
  const nonce = `NONCE_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
  const sign = `SIGN_${Math.random().toString(36).substring(2, 12).toUpperCase()}`
  rawQrInput.value = `http://localhost:5173/#/pages/activity/checkin?actId=${actId.value}&nonce=${nonce}&sign=${sign}`
  uni.showToast({ title: '已填入示例 URL', icon: 'none' })
}

/**
 * 执行向后端提交打卡
 */
const doCheckin = async (qrNonce: string, qrSign: string, qrActivityId = actId.value) => {
  if (checkingIn.value) return
  if (!Number.isInteger(qrActivityId) || qrActivityId <= 0) {
    uni.showToast({ title: '活动信息无效，请从活动详情页进入签到', icon: 'none' })
    return
  }
  if (qrActivityId !== actId.value) {
    uni.showToast({ title: '签到码与当前活动不匹配', icon: 'none' })
    return
  }
  if (!activity.value) {
    uni.showToast({ title: '活动信息尚未加载完成', icon: 'none' })
    return
  }

  const requiresLocation = activity.value.locationCheckEnabled === 1
  if (requiresLocation && !isValidCoordinatePair(activity.value.longitude, activity.value.latitude)) {
    uni.showToast({ title: '活动地点坐标无效，请联系管理员', icon: 'none' })
    return
  }

  if (requiresLocation && (currentLat.value === null || currentLon.value === null)) {
    const located = await updateGpsDistance(false)
    if (!located) return
  }

  // 高德定位范围核验
  if (activity.value?.locationCheckEnabled && !isWithinRadius.value) {
    uni.showModal({
      title: '高德定位核验未通过',
      content: `当前距活动中心 ${distanceToCenter.value} 米，超出打卡允许半径（≤ ${activity.value.locationRadius || 500} 米）。请到达现场后刷新定位再打卡。`,
      showCancel: false,
      confirmText: '我知道了'
    })
    return
  }

  checkingIn.value = true
  uni.showLoading({ title: '高德核验并打卡...', mask: true })

  try {
    const locationData = currentLat.value !== null && currentLon.value !== null
      ? { checkinLatitude: currentLat.value, checkinLongitude: currentLon.value }
      : {}
    const res = await checkinActivityApi({
      activityId: qrActivityId,
      nonce: qrNonce,
      sign: qrSign,
      ...locationData
    })

    uni.hideLoading()
    if (res.pointsAwarded) {
      userStore.updatePoints(res.pointsAwarded)
    }

    checkinResult.value = res
    showSuccessModal.value = true
    stopCamera()
  } catch (err: any) {
    uni.hideLoading()
    uni.showToast({ title: getApiErrorMessage(err, '打卡核验未通过'), icon: 'none' })
    setTimeout(() => {
      scanLocked.value = false
    }, 2500)
  } finally {
    checkingIn.value = false
  }
}

/**
 * 原生 HTML5 video 元素管理（避开 uni-app 将 template <video> 强行转为带有播放器控制条的 uni-video 控件）
 */
let nativeVideoEl: HTMLVideoElement | null = null

const ensureNativeVideo = (): HTMLVideoElement | null => {
  if (nativeVideoEl && nativeVideoEl.parentElement) {
    return nativeVideoEl
  }
  const container = document.getElementById('scannerVideoContainer')
  if (!container) return null

  container.innerHTML = ''
  const v = document.createElement('video')
  v.id = 'scannerVideo'
  v.autoplay = true
  v.playsInline = true
  v.muted = true
  v.setAttribute('autoplay', 'true')
  v.setAttribute('playsinline', 'true')
  v.setAttribute('webkit-playsinline', 'true')
  v.setAttribute('muted', 'true')
  v.className = 'qr-native-video'
  container.appendChild(v)
  nativeVideoEl = v
  return v
}

/**
 * 启动原生 HTML5 WebRTC 视频流与双引擎扫码
 */
let isStartingCamera = false

const initAndStartCamera = async () => {
  // #ifdef H5
  if (typeof window === 'undefined') return
  if (isStartingCamera) {
    console.log('摄像头正在初始化流程中，跳过并发调用')
    return
  }
  isStartingCamera = true
  cameraLoading.value = true
  cameraError.value = ''
  scanLocked.value = false

  try {
    await stopCamera()
    await nextTick()

    // 1. 枚举设备
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevs = devices
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({
            id: d.deviceId,
            label: d.label || `摄像头 ${i + 1}`
          }))
        if (videoDevs.length > 0) {
          camerasList.value = videoDevs
        }
      } catch (e) {
        console.warn('枚举摄像头异常:', e)
      }
    }

    const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }

    if (camerasList.value.length > 0 && camerasList.value[currentCameraIndex.value]?.id) {
      (constraints.video as MediaTrackConstraints).deviceId = {
        exact: camerasList.value[currentCameraIndex.value].id
      }
    } else {
      (constraints.video as MediaTrackConstraints).facingMode = isMobile ? { ideal: 'environment' } : 'user'
    }

    // 2. 调用浏览器原生 getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    activeStream = stream

    // 3. 授权后再次刷新设备列表（此时可获取真实名称如 Integrated Camera）
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevs = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({
          id: d.deviceId,
          label: d.label || `摄像头 ${i + 1}`
        }))
      if (videoDevs.length > 0) {
        camerasList.value = videoDevs
      }
    } catch {}

    // 4. 将视频流直连到原生 video 元素（避开 uni-app 的 uni-video 组件拦截）
    const videoEl = ensureNativeVideo()
    if (videoEl) {
      videoEl.srcObject = stream
      try {
        await videoEl.play()
      } catch (playErr) {
        console.warn('Video play auto-resume:', playErr)
      }
    }

    cameraActive.value = true
    cameraLoading.value = false

    // 5. 启动 BarcodeDetector + jsQR 混合扫码检测循环
    startScanLoop()
  } catch (err: any) {
    console.error('启动摄像头失败：', err)
    cameraActive.value = false
    cameraLoading.value = false
    const errMsg = err?.message || String(err)
    if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
      cameraError.value = '摄像头权限已被拦截，请在浏览器地址栏允许使用摄像头'
    } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
      cameraError.value = '未检测到可用摄像头硬件设备'
    } else if (errMsg.includes('NotReadableError')) {
      cameraError.value = '摄像头正被其他程序占用，请关闭冲突软件后重试'
    } else {
      cameraError.value = `摄像头启动受阻: ${errMsg}`
    }
  } finally {
    isStartingCamera = false
  }
  // #endif
}

/**
 * 安全停止并释放摄像头硬件流
 */
const stopCamera = async () => {
  // #ifdef H5
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
  if (activeStream) {
    activeStream.getTracks().forEach(track => {
      try {
        track.stop()
      } catch (e) {}
    })
    activeStream = null
  }
  if (nativeVideoEl) {
    try {
      nativeVideoEl.pause()
    } catch (e) {}
    nativeVideoEl.srcObject = null
  }
  cameraActive.value = false
  cameraLoading.value = false
  flashActive.value = false
  // #endif
}

/**
 * 帧扫描循环（BarcodeDetector 原生硬件加速 + jsQR 工业级兜底）
 */
const startScanLoop = () => {
  // #ifdef H5
  if (scanTimer) clearInterval(scanTimer)

  scanTimer = setInterval(async () => {
    if (!cameraActive.value || scanLocked.value) return
    const videoEl = nativeVideoEl || (document.getElementById('scannerVideo') as HTMLVideoElement)
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return

    // 优先：原生 BarcodeDetector (Chrome / Edge / Chromium 极速硬件加速)
    if (barcodeDetector) {
      try {
        const barcodes = await barcodeDetector.detect(videoEl)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          onScanSuccess(barcodes[0].rawValue)
          return
        }
      } catch (e) {}
    }

    // 备用：Canvas 抽帧 + jsQR 纯 JS 工业级解析
    try {
      if (!canvasEl) {
        canvasEl = document.createElement('canvas')
      }
      const vw = videoEl.videoWidth
      const vh = videoEl.videoHeight
      if (vw > 0 && vh > 0) {
        const targetW = Math.min(vw, 640)
        const targetH = Math.floor(vh * (targetW / vw))
        canvasEl.width = targetW
        canvasEl.height = targetH
        if (!canvasCtx) {
          canvasCtx = canvasEl.getContext('2d', { willReadFrequently: true })
        }
        if (canvasCtx) {
          canvasCtx.drawImage(videoEl, 0, 0, targetW, targetH)
          const imgData = canvasCtx.getImageData(0, 0, targetW, targetH)
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'dontInvert'
          })
          if (code && code.data) {
            onScanSuccess(code.data)
          }
        }
      }
    } catch (e) {}
  }, 220)
  // #endif
}

/**
 * 切换摄像头（支持 PC 外置/内置或手机前置/后置）
 */
const switchCamera = async () => {
  if (camerasList.value.length <= 1) {
    uni.showToast({ title: '当前仅检测到一个可用摄像头', icon: 'none' })
    return
  }
  await stopCamera()
  currentCameraIndex.value = (currentCameraIndex.value + 1) % camerasList.value.length
  uni.showToast({
    title: `已切换至：${activeCameraLabel.value || '镜头 ' + (currentCameraIndex.value + 1)}`,
    icon: 'none'
  })
  await initAndStartCamera()
}

/**
 * 触发本地图片二维码识别
 */
const triggerFileInput = () => {
  // #ifdef H5
  const inputEl = document.getElementById('qr-file-input') as HTMLInputElement
  if (inputEl) {
    inputEl.value = ''
    inputEl.click()
  }
  // #endif
  // #ifndef H5
  uni.chooseImage({
    count: 1,
    sourceType: ['album'],
    success: (res) => {
      uni.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode'],
        success: (scanRes) => {
          onScanSuccess(scanRes.result)
        }
      })
    }
  })
  // #endif
}

const handleFileChange = async (event: Event) => {
  // #ifdef H5
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  const file = target.files[0]

  uni.showLoading({ title: '正在识别图片二维码...', mask: true })
  try {
    const img = new Image()
    const url = URL.createObjectURL(file)
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })

    let recognizedText = ''

    // 引擎1：BarcodeDetector
    if (barcodeDetector) {
      try {
        const barcodes = await barcodeDetector.detect(img)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          recognizedText = barcodes[0].rawValue
        }
      } catch (e) {}
    }

    // 引擎2：jsQR
    if (!recognizedText) {
      const fileCanvas = document.createElement('canvas')
      fileCanvas.width = img.naturalWidth || img.width
      fileCanvas.height = img.naturalHeight || img.height
      const fileCtx = fileCanvas.getContext('2d')
      if (fileCtx) {
        fileCtx.drawImage(img, 0, 0)
        const imgData = fileCtx.getImageData(0, 0, fileCanvas.width, fileCanvas.height)
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth'
        })
        if (code && code.data) {
          recognizedText = code.data
        }
      }
    }

    URL.revokeObjectURL(url)
    uni.hideLoading()

    if (recognizedText) {
      onScanSuccess(recognizedText)
    } else {
      uni.showToast({ title: '未在图片中识别出有效二维码', icon: 'none' })
    }
  } catch (err: any) {
    uni.hideLoading()
    uni.showToast({ title: '图片读取失败，请检查文件格式', icon: 'none' })
  }
  // #endif
}

/**
 * 二维码扫描成功总入口
 */
const onScanSuccess = (decodedText: string) => {
  if (scanLocked.value) return
  scanLocked.value = true

  // 震动与识别提示
  try { uni.vibrateShort?.({}) } catch {}
  uni.showToast({ title: '二维码识别成功', icon: 'success', duration: 1200 })

  rawQrInput.value = decodedText

  setTimeout(() => {
    try {
      const parsed = parseQrPayload(decodedText)
      if (parsed.activityId !== actId.value) {
        uni.showToast({
          title: `该签到码属于活动 ${parsed.activityId}，请进入对应活动打卡`,
          icon: 'none',
          duration: 3000
        })
        setTimeout(() => {
          scanLocked.value = false
        }, 2500)
        return
      }
      doCheckin(parsed.nonce, parsed.sign, parsed.activityId)
    } catch (e: any) {
      uni.showToast({ title: e?.message || '二维码格式解析失败', icon: 'none' })
      setTimeout(() => {
        scanLocked.value = false
      }, 2500)
    }
  }, 400)
}

const handleRealScan = () => {
  // #ifndef H5
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ['qrCode'],
    success: (res) => {
      onScanSuccess(res.result)
    },
    fail: () => {
      uni.showToast({ title: '已取消扫码', icon: 'none' })
    }
  })
  // #endif

  // #ifdef H5
  if (!cameraActive.value) {
    initAndStartCamera()
    uni.showToast({ title: '正在启动摄像头扫码...', icon: 'none' })
  } else if (rawQrInput.value.trim()) {
    handleParseAndCheckinClick()
  } else {
    uni.showToast({ title: '请将动态二维码置于取景框中', icon: 'none' })
  }
  // #endif
}

const goBackHall = () => {
  showSuccessModal.value = false
  stopCamera()
  uni.switchTab({
    url: '/pages/activity/index'
  })
}

const goToCertificates = () => {
  showSuccessModal.value = false
  stopCamera()
  uni.showModal({
    title: '荣誉电子证书',
    content: `已成功为您颁发「${activity.value?.certificateTitle || '学术实训结业证书'}」！\n证书编号：CERT-2026-00${actId.value}，可在个人中心随时查看与核验导出。`,
    showCancel: false,
    confirmText: '我知道了',
    success: () => {
      uni.switchTab({ url: '/pages/activity/index' })
    }
  })
}

let pageLoadedOnce = false

onMounted(() => {
  // #ifdef H5
  pageLoadedOnce = true
  initAndStartCamera()
  // #endif
})

onShow(() => {
  // #ifdef H5
  if (!pageLoadedOnce) return
  if (!cameraActive.value && !isStartingCamera && !showSuccessModal.value) {
    initAndStartCamera()
  }
  // #endif
})

onHide(() => {
  // #ifdef H5
  stopCamera()
  // #endif
})

onBeforeUnmount(() => {
  // #ifdef H5
  stopCamera()
  // #endif
})

onLoad(async (query: any) => {
  const rawId = query?.actId || query?.activityId || query?.id
  let parsedId = Number(rawId)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || String(rawId).includes('object')) {
    parsedId = 1
  }
  actId.value = parsedId

  // 若 URL 直接带有 nonce 和 sign，自动填入模拟输入框
  if (query?.nonce && query?.sign) {
    rawQrInput.value = JSON.stringify({
      activityId: actId.value,
      nonce: query.nonce,
      sign: query.sign
    }, null, 2)
  }

  await loadActivity()
})
</script>

<template>
  <view class="checkin-container">
    <!-- 顶部导航栏 -->
    <view class="checkin-header">
      <view class="checkin-back-btn" @click="goBackHall">
        <svg class="header-svg" viewBox="0 0 24 24">
          <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z"/>
        </svg>
      </view>
      <text class="checkin-title">现场扫码考勤打卡</text>
      <view
        class="checkin-tool-btn"
        :class="{ active: flashActive }"
        @click="toggleFlashlight"
      >
        <svg class="header-svg" viewBox="0 0 24 24">
          <path d="M7,2H17A1,1 0 0,1 18,3V6C18,7.36 17.14,8.5 16,9.2V11H17A1,1 0 0,1 18,12V21A1,1 0 0,1 17,22H7A1,1 0 0,1 6,21V12A1,1 0 0,1 7,11H8V9.2C6.86,8.5 6,7.36 6,6V3A1,1 0 0,1 7,2M12,13A1.5,1.5 0 0,0 10.5,14.5A1.5,1.5 0 0,0 12,16A1.5,1.5 0 0,0 13.5,14.5A1.5,1.5 0 0,0 12,13M8,4V6H16V4H8Z"/>
        </svg>
      </view>
    </view>

    <!-- 活动信息贴条 -->
    <view v-if="activity" class="act-focus-strip">
      <text class="focus-title">{{ activity.title }}</text>
      <text class="focus-pts">+{{ activity.points }} pts</text>
    </view>

    <!-- 主体扫描与输入区域 -->
    <view class="scanner-body">
      <!-- 科技感扫描取景框 -->
      <view class="scan-viewfinder-wrapper">
        <!-- 原生视频元素挂载容器（纯 div，彻底绕开 uni-app 自动注入 uni-video 播放器控件） -->
        <!-- #ifdef H5 -->
        <div id="scannerVideoContainer" class="qr-video-container"></div>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <view id="qr-reader" class="qr-video-container"></view>
        <!-- #endif -->

        <!-- 摄像头状态提示（加载中 / 未开启 / 出错）使用 v-show 彻底杜绝 DOM 节点重建 -->
        <view v-show="cameraLoading" class="camera-state-overlay">
          <view class="camera-spinner" />
          <text class="camera-state-text">正在启动摄像头硬件...</text>
        </view>

        <view v-show="!cameraActive && !cameraLoading" class="camera-state-overlay camera-inactive">
          <svg class="camera-off-svg" viewBox="0 0 24 24">
            <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
          </svg>
          <text v-if="cameraError" class="camera-state-text error-text">{{ cameraError }}</text>
          <text v-else class="camera-state-text">摄像头未开启或已被暂停</text>
          <button class="btn-start-camera" @click="initAndStartCamera">开启摄像头</button>
        </view>

        <!-- 科技感取景装饰层 -->
        <view class="scan-decor-overlay">
          <view class="scan-corner corner-tl" />
          <view class="scan-corner corner-tr" />
          <view class="scan-corner corner-bl" />
          <view class="scan-corner corner-br" />
          <view v-show="cameraActive && !scanLocked" class="scan-laser" />
          <view v-show="scanLocked" class="scan-success-mask">
            <text class="scan-success-badge">✓ 二维码已识别</text>
          </view>
        </view>
      </view>

      <!-- 摄像头状态指示与控制操作栏 -->
      <view class="camera-control-bar">
        <view class="camera-status-pill" :class="{ online: cameraActive }">
          <view class="status-dot" />
          <text class="status-label">{{ cameraActive ? (activeCameraLabel || '摄像头扫描中') : '摄像头已停用' }}</text>
        </view>
        <view class="camera-action-btns">
          <button v-if="cameraActive" class="cam-action-btn" @click="stopCamera">
            <svg class="cam-icon" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M9,9H15V15H9V9Z"/></svg>
            <text>暂停</text>
          </button>
          <button v-else class="cam-action-btn primary" @click="initAndStartCamera">
            <svg class="cam-icon" viewBox="0 0 24 24"><path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/></svg>
            <text>启动</text>
          </button>
          <button v-if="camerasList.length > 1" class="cam-action-btn" @click="switchCamera">
            <svg class="cam-icon" viewBox="0 0 24 24"><path d="M12,4V1L8,5L12,9V6C15.31,6 18,8.69 18,12C18,13.04 17.74,14.03 17.27,14.89L18.73,16.35C19.53,15.08 20,13.6 20,12A8,8 0 0,0 12,4M6.73,7.65C5.93,8.92 5.5,10.4 5.5,12A8,8 0 0,0 13.5,20V23L17.5,19L13.5,15V18C10.19,18 7.5,15.31 7.5,12C7.5,10.96 7.76,9.97 8.23,9.11L6.73,7.65Z"/></svg>
            <text>换镜头</text>
          </button>
          <button class="cam-action-btn" @click="triggerFileInput">
            <svg class="cam-icon" viewBox="0 0 24 24"><path d="M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z"/></svg>
            <text>传图识别</text>
          </button>
        </view>
        <!-- 隐藏的原生文件上传控件 -->
        <!-- #ifdef H5 -->
        <input
          id="qr-file-input"
          type="file"
          accept="image/*"
          style="display: none;"
          @change="handleFileChange"
        />
        <!-- #endif -->
      </view>

      <view class="scan-guidelines">
        <view class="guide-line1">请对准大屏幕展示的动态签到二维码</view>
        <view class="guide-line2">支持 PC/手机 摄像头自动取景；无摄像头亦可在下方直接粘贴 JSON 打卡</view>
        <view class="guide-tip-camera">💡 若画面为黑屏，请检查电脑摄像头防窥物理滑盖是否已开启，或按快捷键(如FnLock/F8)解除隐私遮挡</view>
      </view>

      <!-- 移动端模拟扫码：输入 JSON 模拟方框 -->
      <view class="desktop-scan-panel">
        <view class="panel-header-row">
          <view class="panel-badge-left">
            <svg class="panel-icon-svg" viewBox="0 0 24 24">
              <path d="M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z"/>
            </svg>
            <text class="panel-heading">模拟扫码 · 粘贴二维码 JSON</text>
          </view>
          <text class="panel-tag-pill">模拟扫码框</text>
        </view>

        <view class="panel-sub-tip">
          电脑模拟器无法调用真机摄像头，请直接在方框内粘贴或输入二维码 JSON：
        </view>

        <textarea
          v-model="rawQrInput"
          class="json-textarea"
          placeholder='例如：{"activityId": 1, "nonce": "...", "sign": "..."} 或直接粘贴管理后台二维码内容'
          :maxlength="1200"
        />

        <view class="panel-quick-actions">
          <button class="quick-btn" @click="handleFillSampleJson">
            <svg class="mini-svg" viewBox="0 0 24 24"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
            填入示例 JSON
          </button>
          <button class="quick-btn" @click="handleFillSampleUrl">
            <svg class="mini-svg" viewBox="0 0 24 24"><path d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z"/></svg>
            填入 URL 格式
          </button>
          <button class="quick-btn btn-clear" @click="rawQrInput = ''">清空</button>
        </view>

        <button class="btn-parse-and-checkin" :disabled="checkingIn" @click="handleParseAndCheckinClick">
          <svg class="parse-svg" viewBox="0 0 24 24">
            <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
          </svg>
          <text>{{ checkingIn ? '正在核验签到...' : '解析 JSON 并完成打卡' }}</text>
        </button>
      </view>

      <!-- 真实设备定位与考勤范围核验 -->
      <view class="amap-badge-card" :class="{ 'amap-warning': !isWithinRadius }">
        <view class="amap-top-row">
          <view class="amap-brand">
            <svg class="amap-logo-svg" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/></svg>
            <text class="amap-brand-title">设备考勤定位</text>
            <text class="amap-tag-pill">真实定位</text>
          </view>
          <view class="amap-mode-tabs">
            <view
              class="mode-tab-btn"
              :class="{ active: !amapLoading }"
              @click="updateGpsDistance(false)"
            >
              {{ amapLoading ? '定位中...' : '刷新定位' }}
            </view>
          </view>
        </view>

        <!-- 高德逆地理编码地址 (georegeo) -->
        <view class="amap-addr-row">
          <svg class="amap-pin-svg" viewBox="0 0 24 24"><path d="M12,2C15.31,2 18,4.69 18,8C18,12.5 12,22 12,22C12,22 6,12.5 6,8C6,4.69 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6Z"/></svg>
          <text class="amap-addr-text">{{ amapAddress }}</text>
        </view>

        <!-- 考勤范围与高德测距判定 -->
        <view v-if="distanceToCenter !== null" class="amap-status-strip">
          <text v-if="isWithinRadius" class="status-ok">
            ✓ 高德核验合格：距打卡中心 {{ distanceToCenter }} 米（允许 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
          <text v-else class="status-warn">
            ✕ 超出打卡范围：距中心点 {{ distanceToCenter }} 米（要求 ≤ {{ activity?.locationRadius || 500 }}m）
          </text>
        </view>
        <view v-else class="amap-status-strip">
          <text class="status-warn">尚未取得真实定位，暂不能提交打卡</text>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="checkin-footer">
      <button class="btn-simulate-scan" :disabled="checkingIn" @click="handleRealScan">
        <svg class="scan-btn-svg" viewBox="0 0 24 24">
          <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
        </svg>
        <text>{{ checkingIn ? '正在校验防伪与考勤...' : '扫描或解析现场动态二维码' }}</text>
      </button>
    </view>

    <!-- 考勤成功弹窗 -->
    <view v-if="showSuccessModal" class="success-modal-mask">
      <view class="success-modal-content">
        <view class="success-icon-badge">
          <svg class="check-svg" viewBox="0 0 24 24">
            <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
        </view>
        <view class="success-title">考勤签到成功</view>
        <view class="success-sub">
          已完成【{{ activity?.title }}】现场签到出勤
        </view>

        <!-- 积分发放卡片 -->
        <view class="points-grant-box">
          <view class="points-grant-title">本次活动考核奖励</view>
          <view class="points-grant-val">
            +{{ checkinResult?.pointsAwarded || activity?.points || 50 }}
            <text class="pts-unit">pts</text>
          </view>
          <view class="points-grant-sub">
            已即时入账至可用学分余额（最新余额：{{ checkinResult?.currentPoints || userStore.userInfo.currentPoints }} pts）
          </view>
        </view>

        <!-- 电子证书发放提示 -->
        <view v-if="checkinResult?.certificateIssued || activity?.certificateEnabled" class="cert-grant-notice">
          <svg class="cert-svg" viewBox="0 0 24 24">
            <path d="M13,21V19H17.8L13,14.2V9H18.2L13.4,4.2L14.8,2.8L21.6,9.6L14.8,16.4L16.2,17.8L18.4,15.6V21H13M11,21H3V3H11V5H5V19H11V21Z"/>
          </svg>
          <view class="cert-text">
            <view class="cert-strong">电子荣誉证书已签发</view>
            <view class="cert-desc">
              证书：{{ activity?.certificateTitle || '学术实训结业证书' }}，可在证书中心核验与导出。
            </view>
          </view>
        </view>

        <view class="modal-btn-column">
          <button
            v-if="checkinResult?.certificateIssued || activity?.certificateEnabled"
            class="modal-btn btn-primary"
            @click="goToCertificates"
          >
            查看我的电子证书
          </button>
          <button class="modal-btn btn-default" @click="goBackHall">
            返回活动大厅
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.checkin-container {
  min-height: 100vh;
  background-color: #0f172a;
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部操作条 */
.checkin-header {
  padding: 40rpx 28rpx 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.checkin-back-btn,
.checkin-tool-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.checkin-back-btn:active {
  background-color: rgba(255, 255, 255, 0.25);
}

.checkin-tool-btn.active {
  background-color: #e6a23c;
}

.header-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #ffffff;
}

.checkin-title {
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}

.act-focus-strip {
  background-color: rgba(30, 58, 138, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14rpx 28rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.focus-title {
  font-size: 24rpx;
  color: #93c5fd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 500rpx;
}

.focus-pts {
  font-size: 24rpx;
  font-weight: 700;
  color: #fcd34d;
}

/* 扫描取景区域 */
.scanner-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 28rpx 32rpx 40rpx;
  overflow-y: auto;
}

.scan-viewfinder-wrapper {
  width: 520rpx;
  height: 520rpx;
  position: relative;
  border-radius: 20rpx;
  background-color: #020617;
  overflow: hidden;
  box-shadow: 0 0 60rpx rgba(64, 158, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.qr-native-video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  background-color: #020617 !important;
}

.qr-video-container,
:deep(#qr-reader) {
  width: 100% !important;
  height: 100% !important;
  position: relative !important;
  overflow: hidden !important;
}

:deep(#qr-reader__scan_region),
:deep(#qr-reader > div) {
  width: 100% !important;
  height: 100% !important;
  position: relative !important;
  overflow: hidden !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:deep(#qr-reader video),
.qr-video-container video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}

:deep(#qr-shaded-region),
:deep(#qr-reader__dashboard_section) {
  display: none !important;
}

.camera-state-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.96);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30rpx;
  text-align: center;
  gap: 16rpx;
}

.camera-spinner {
  width: 50rpx;
  height: 50rpx;
  border: 4rpx solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.camera-off-svg {
  width: 64rpx;
  height: 64rpx;
  fill: #64748b;
  opacity: 0.6;
}

.camera-state-text {
  font-size: 22rpx;
  color: #94a3b8;
  line-height: 1.4;
}

.camera-state-text.error-text {
  color: #f87171;
}

.btn-start-camera {
  margin-top: 10rpx;
  padding: 10rpx 28rpx;
  font-size: 22rpx;
  background: #0284c7;
  color: #ffffff;
  border-radius: 8rpx;
  border: none;
  font-weight: 600;
}

.scan-decor-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.scan-success-mask {
  position: absolute;
  inset: 0;
  background: rgba(34, 197, 94, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #22c55e;
  border-radius: 20rpx;
  backdrop-filter: blur(2px);
}

.scan-success-badge {
  background: #16a34a;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  padding: 12rpx 28rpx;
  border-radius: 30rpx;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.3);
}

/* 控制条 */
.camera-control-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 12rpx 16rpx;
  background: rgba(30, 41, 59, 0.7);
  border-radius: 12rpx;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.camera-status-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 22rpx;
  color: #94a3b8;
  max-width: 260rpx;
}

.status-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #64748b;
  flex-shrink: 0;
}

.camera-status-pill.online .status-dot {
  background: #22c55e;
  box-shadow: 0 0 10rpx #22c55e;
}

.camera-status-pill.online {
  color: #86efac;
}

.status-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-action-btns {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.cam-action-btn {
  font-size: 20rpx;
  padding: 8rpx 14rpx;
  border-radius: 6rpx;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  gap: 6rpx;
  line-height: 1;
  margin: 0;
}

.cam-action-btn.primary {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.cam-action-btn:active {
  opacity: 0.8;
}

.cam-icon {
  width: 22rpx;
  height: 22rpx;
  fill: currentColor;
}

/* 边角 */
.scan-corner {
  position: absolute;
  width: 40rpx;
  height: 40rpx;
  border-color: #409eff;
  border-style: solid;
}

.corner-tl {
  top: 0;
  left: 0;
  border-width: 6rpx 0 0 6rpx;
  border-top-left-radius: 12rpx;
}

.corner-tr {
  top: 0;
  right: 0;
  border-width: 6rpx 6rpx 0 0;
  border-top-right-radius: 12rpx;
}

.corner-bl {
  bottom: 0;
  left: 0;
  border-width: 0 0 6rpx 6rpx;
  border-bottom-left-radius: 12rpx;
}

.corner-br {
  bottom: 0;
  right: 0;
  border-width: 0 6rpx 6rpx 0;
  border-bottom-right-radius: 12rpx;
}

/* 激光线 */
.scan-laser {
  position: absolute;
  left: 0;
  width: 100%;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, #409eff, #60a5fa, transparent);
  box-shadow: 0 0 16rpx #409eff;
  animation: laserSweep 2.4s infinite ease-in-out;
}

@keyframes laserSweep {
  0% { top: 20rpx; opacity: 0.3; }
  50% { top: 490rpx; opacity: 1; }
  100% { top: 20rpx; opacity: 0.3; }
}

.scan-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.12;
}

.watermark-svg {
  width: 100rpx;
  height: 100rpx;
  fill: #ffffff;
}

.scan-guidelines {
  margin-top: 24rpx;
  text-align: center;
  font-size: 24rpx;
  color: #94a3b8;
  line-height: 1.5;
}

.guide-line1 {
  font-weight: 600;
  color: #e2e8f0;
}

.guide-line2 {
  font-size: 22rpx;
  color: #38bdf8;
  margin-top: 4rpx;
}

.guide-tip-camera {
  font-size: 20rpx;
  color: #fde047;
  margin-top: 10rpx;
  line-height: 1.4;
  opacity: 0.92;
}

/* 💻 电脑端模拟扫码面板样式 */
.desktop-scan-panel {
  width: 100%;
  box-sizing: border-box;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 24rpx;
  backdrop-filter: blur(8px);
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.4);
}

.panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.panel-badge-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.panel-icon-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #38bdf8;
}

.panel-heading {
  font-size: 26rpx;
  font-weight: 700;
  color: #38bdf8;
}

.panel-tag-pill {
  font-size: 20rpx;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
}

.panel-sub-tip {
  font-size: 22rpx;
  color: #94a3b8;
  margin-bottom: 14rpx;
  line-height: 1.4;
}

.json-textarea {
  width: 100%;
  min-height: 140rpx;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10rpx;
  padding: 16rpx;
  font-size: 22rpx;
  font-family: monospace;
  color: #e2e8f0;
  line-height: 1.4;
  margin-bottom: 16rpx;
}

.json-textarea:focus {
  border-color: #38bdf8;
}

.panel-quick-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
  flex-wrap: wrap;
}

.quick-btn {
  font-size: 22rpx;
  line-height: 1;
  padding: 12rpx 18rpx;
  border-radius: 8rpx;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #bae6fd;
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 0;
}

.quick-btn:active {
  background: rgba(56, 189, 248, 0.3);
}

.quick-btn.btn-clear {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.35);
  color: #fca5a5;
  margin-left: auto;
}

.mini-svg {
  width: 24rpx;
  height: 24rpx;
  fill: currentColor;
}

.btn-parse-and-checkin {
  width: 100%;
  height: 76rpx;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none;
  border-radius: 10rpx;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 4rpx 14rpx rgba(2, 132, 199, 0.4);
}

.btn-parse-and-checkin:active {
  opacity: 0.9;
  transform: scale(0.99);
}

.parse-svg {
  width: 30rpx;
  height: 30rpx;
  fill: #ffffff;
}

/* 高德地图智能定位卡片样式 */
.amap-badge-card {
  width: 100%;
  box-sizing: border-box;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(64, 158, 255, 0.35);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-top: 20rpx;
  backdrop-filter: blur(8px);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.35);
}

.amap-badge-card.amap-warning {
  border-color: rgba(245, 108, 108, 0.45);
  background: rgba(40, 20, 25, 0.85);
}

.amap-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.amap-brand {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.amap-logo-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #409eff;
  flex-shrink: 0;
}

.amap-brand-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #60a5fa;
  letter-spacing: 0.5rpx;
}

.amap-tag-pill {
  font-size: 20rpx;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  margin-left: 8rpx;
}

.amap-tag-pill.pill-benchmark {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.18);
  border-color: rgba(103, 194, 58, 0.35);
}

.amap-mode-tabs {
  display: flex;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24rpx;
  padding: 4rpx;
  gap: 4rpx;
}

.mode-tab-btn {
  font-size: 20rpx;
  padding: 6rpx 14rpx;
  border-radius: 20rpx;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tab-btn.active {
  background: #409eff;
  color: #ffffff;
  font-weight: 600;
}

.amap-addr-row {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  padding: 8rpx 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 10rpx;
}

.amap-pin-svg {
  width: 24rpx;
  height: 24rpx;
  fill: #94a3b8;
  margin-top: 4rpx;
  flex-shrink: 0;
}

.amap-addr-text {
  font-size: 22rpx;
  color: #cbd5e1;
  line-height: 1.4;
  word-break: break-all;
  flex: 1;
}

.amap-status-strip {
  font-size: 22rpx;
  line-height: 1.4;
  margin-top: 4rpx;
}

.status-ok {
  color: #67c23a;
  font-weight: 500;
}

.status-warn {
  color: #f87171;
  font-weight: 500;
}

/* 底部操作 */
.checkin-footer {
  padding: 24rpx 32rpx;
  background-color: rgba(15, 23, 42, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-simulate-scan {
  width: 100%;
  height: 84rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  background-color: #409eff;
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 4rpx 16rpx rgba(64, 158, 255, 0.4);
  transition: all 0.15s ease;
}

.btn-simulate-scan:active {
  transform: scale(0.98);
  background-color: #66b1ff;
}

.scan-btn-svg {
  width: 32rpx;
  height: 32rpx;
  fill: #ffffff;
}

/* 考勤成功弹窗 */
.success-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.75);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36rpx;
}

.success-modal-content {
  background-color: #ffffff;
  border-radius: 16rpx;
  width: 100%;
  max-width: 600rpx;
  padding: 40rpx 32rpx 36rpx;
  text-align: center;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.25);
  color: #303133;
}

.success-icon-badge {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: #f0f9eb;
  border: 3rpx solid #b3e19d;
  color: #67c23a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.check-svg {
  width: 52rpx;
  height: 52rpx;
  fill: #67c23a;
}

.success-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #303133;
  margin-bottom: 12rpx;
}

.success-sub {
  font-size: 24rpx;
  color: #606266;
  margin-bottom: 32rpx;
  line-height: 1.4;
}

.points-grant-box {
  background: linear-gradient(135deg, #ecf5ff, #f0f9eb);
  border: 1px solid #d9ecff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.points-grant-title {
  font-size: 22rpx;
  color: #909399;
  margin-bottom: 8rpx;
}

.points-grant-val {
  font-size: 52rpx;
  font-weight: 800;
  color: #409eff;
  line-height: 1.2;
}

.pts-unit {
  font-size: 24rpx;
  font-weight: 500;
  margin-left: 6rpx;
  color: #67c23a;
}

.points-grant-sub {
  font-size: 20rpx;
  color: #67c23a;
  margin-top: 8rpx;
}

.cert-grant-notice {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 32rpx;
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  text-align: left;
}

.cert-svg {
  width: 36rpx;
  height: 36rpx;
  fill: #e6a23c;
  flex-shrink: 0;
  margin-top: 4rpx;
}

.cert-text {
  flex: 1;
}

.cert-strong {
  font-size: 24rpx;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 4rpx;
}

.cert-desc {
  font-size: 20rpx;
  color: #909399;
  line-height: 1.4;
}

.modal-btn-column {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.modal-btn {
  width: 100%;
  height: 76rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background-color: #409eff;
  color: #ffffff;
  border: none;
}

.btn-primary:active {
  background-color: #66b1ff;
}

.btn-default {
  background-color: #f4f4f5;
  color: #606266;
  border: 1px solid #dcdfe6;
}

.btn-default:active {
  background-color: #e9e9eb;
}
</style>
