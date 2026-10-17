<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
// #ifdef H5
import jsQR from 'jsqr'
// #endif

interface Props {
  preferFront?: boolean
  autoStart?: boolean
  scanInterval?: number
  scanLocked?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  preferFront: true,
  autoStart: true,
  scanInterval: 220,
  scanLocked: false
})

const emit = defineEmits<{
  (e: 'scan', result: string): void
  (e: 'error', message: string): void
  (e: 'cameraReady', stream: any): void
  (e: 'torchChange', active: boolean): void
}>()

const cameraActive = ref(false)
const cameraLoading = ref(false)
const cameraError = ref('')
const camerasList = ref<{ id: string; label: string }[]>([])
const currentCameraIndex = ref(0)
const flashActive = ref(false)

// 微信小程序原生相机方向：'front'（前置） | 'back'（后置）
const currentDevicePosition = ref<'front' | 'back'>(props.preferFront ? 'front' : 'back')

watch(
  () => props.preferFront,
  (newVal) => {
    currentDevicePosition.value = newVal ? 'front' : 'back'
  }
)

let activeStream: MediaStream | null = null
let scanTimer: any = null
let nativeVideoEl: HTMLVideoElement | null = null
let canvasEl: HTMLCanvasElement | null = null
let canvasCtx: CanvasRenderingContext2D | null = null
let barcodeDetector: any = null
let isStartingCamera = false

// #ifdef H5
if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
  try {
    barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
  } catch (e) {
    barcodeDetector = null
  }
}
// #endif

const activeCameraLabel = computed(() => {
  // #ifdef MP-WEIXIN
  return currentDevicePosition.value === 'front' ? '前置摄像头 (PC/真机)' : '后置摄像头'
  // #endif
  // #ifdef H5
  if (camerasList.value.length === 0) return ''
  const cur = camerasList.value[currentCameraIndex.value]
  return cur?.label || `镜头 ${currentCameraIndex.value + 1}`
  // #endif
  // #ifndef H5 || MP-WEIXIN
  return '相机已就绪'
  // #endif
})

// #ifdef H5
const ensureNativeVideo = (): HTMLVideoElement | null => {
  if (nativeVideoEl && nativeVideoEl.parentElement) {
    return nativeVideoEl
  }
  const container = document.getElementById('xviewCameraContainer')
  if (!container) return null

  container.innerHTML = ''
  const v = document.createElement('video')
  v.id = 'xviewNativeVideo'
  v.autoplay = true
  v.playsInline = true
  v.muted = true
  v.setAttribute('autoplay', 'true')
  v.setAttribute('playsinline', 'true')
  v.setAttribute('webkit-playsinline', 'true')
  v.setAttribute('muted', 'true')
  v.className = 'xview-native-video-elem'
  container.appendChild(v)
  nativeVideoEl = v
  return v
}
// #endif

/**
 * 启动相机流程（跨端：H5 WebRTC + MP-WEIXIN 原生组件授权）
 */
const startCamera = async () => {
  if (isStartingCamera) return
  isStartingCamera = true
  cameraLoading.value = true
  cameraError.value = ''

  // 1. 微信小程序平台 (MP-WEIXIN)
  // #ifdef MP-WEIXIN
  try {
    const setting = await uni.getSetting()
    const auth = setting?.authSetting?.['scope.camera']
    if (auth === false) {
      const modal = await uni.showModal({
        title: '需要相机权限',
        content: '现场扫码打卡需要使用摄像头权限，请在权限设置中允许开启。',
        confirmText: '去设置',
        cancelText: '取消'
      })
      if (modal.confirm) {
        const openRes = await uni.openSetting()
        if (openRes.authSetting?.['scope.camera']) {
          cameraActive.value = true
          cameraLoading.value = false
          emit('cameraReady', null)
          return
        }
      }
      cameraError.value = '摄像头权限未开启，无法使用扫码'
      cameraLoading.value = false
      emit('error', cameraError.value)
      return
    }

    cameraActive.value = true
  } catch (err: any) {
    console.error('小程序相机初始化异常:', err)
    cameraError.value = err?.errMsg || err?.message || '相机启动受阻'
    cameraActive.value = false
    cameraLoading.value = false
    emit('error', cameraError.value)
  } finally {
    isStartingCamera = false
  }
  // #endif

  // 2. H5 / PC 浏览器平台
  // #ifdef H5
  if (typeof window === 'undefined') {
    isStartingCamera = false
    return
  }

  try {
    await stopCamera()
    await nextTick()

    // 枚举硬件设备，优先识别 PC 前置内置摄像头
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
        console.warn('枚举设备提示:', e)
      }
    }

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
      (constraints.video as MediaTrackConstraints).facingMode = props.preferFront ? 'user' : { ideal: 'environment' }
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    activeStream = stream

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

    const videoEl = ensureNativeVideo()
    if (videoEl) {
      videoEl.srcObject = stream
      try {
        await videoEl.play()
      } catch (e) {}
    }

    cameraActive.value = true
    cameraLoading.value = false
    emit('cameraReady', stream)

    startScanLoop()
  } catch (err: any) {
    console.error('xview-camera 启动异常:', err)
    cameraActive.value = false
    cameraLoading.value = false
    const msg = err?.message || String(err)
    if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
      cameraError.value = '摄像头权限被拦截，请在浏览器地址栏允许使用摄像头'
    } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
      cameraError.value = '未检测到可用摄像头硬件设备'
    } else if (msg.includes('NotReadableError')) {
      cameraError.value = '摄像头正被其他应用占用，请关闭冲突软件后重试'
    } else {
      cameraError.value = `摄像头启动受阻: ${msg}`
    }
    emit('error', cameraError.value)
  } finally {
    isStartingCamera = false
  }
  // #endif
}

/**
 * 停止相机硬件流
 */
const stopCamera = async () => {
  // #ifdef H5
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
  if (activeStream) {
    activeStream.getTracks().forEach(track => {
      try { track.stop() } catch (e) {}
    })
    activeStream = null
  }
  if (nativeVideoEl) {
    try { nativeVideoEl.pause() } catch (e) {}
    nativeVideoEl.srcObject = null
  }
  // #endif

  cameraActive.value = false
  cameraLoading.value = false
  flashActive.value = false
}

/**
 * H5 帧扫描检测循环
 */
// #ifdef H5
const startScanLoop = () => {
  if (scanTimer) clearInterval(scanTimer)

  scanTimer = setInterval(async () => {
    if (!cameraActive.value || props.scanLocked) return
    const videoEl = nativeVideoEl || (document.getElementById('xviewNativeVideo') as HTMLVideoElement)
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return

    // 引擎 1：原生 BarcodeDetector 硬件加速
    if (barcodeDetector) {
      try {
        const barcodes = await barcodeDetector.detect(videoEl)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          emit('scan', barcodes[0].rawValue)
          return
        }
      } catch (e) {}
    }

    // 引擎 2：Canvas + jsQR 工业级兜底
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
            emit('scan', code.data)
          }
        }
      }
    } catch (e) {}
  }, props.scanInterval)
}
// #endif

/**
 * 微信小程序原生 camera 组件扫码与生命周期事件
 */
// #ifdef MP-WEIXIN
const onWxScanCode = (e: any) => {
  if (props.scanLocked) return
  const result = e.detail?.result
  if (result) {
    emit('scan', result)
  }
}

const onWxCameraError = (e: any) => {
  console.error('小程序 camera 组件报错:', e)
  const msg = e.detail?.errMsg || '相机启动失败，请检查摄像头是否被占用或滑盖未开'
  cameraError.value = msg
  cameraLoading.value = false
  cameraActive.value = false
  emit('error', msg)
}

const onWxCameraInitDone = (e: any) => {
  cameraLoading.value = false
  cameraActive.value = true
  cameraError.value = ''
  emit('cameraReady', e.detail)
}
// #endif

/**
 * 切换前置/后置摄像头
 */
const switchCamera = async () => {
  // #ifdef MP-WEIXIN
  currentDevicePosition.value = currentDevicePosition.value === 'front' ? 'back' : 'front'
  uni.showToast({
    title: `已切换至：${currentDevicePosition.value === 'front' ? '前置镜头' : '后置镜头'}`,
    icon: 'none'
  })
  // #endif

  // #ifdef H5
  if (camerasList.value.length <= 1) {
    uni.showToast({ title: '当前仅检测到一个可用摄像头', icon: 'none' })
    return
  }
  await stopCamera()
  currentCameraIndex.value = (currentCameraIndex.value + 1) % camerasList.value.length
  uni.showToast({
    title: `已切换至：${activeCameraLabel.value}`,
    icon: 'none'
  })
  await startCamera()
  // #endif
}

/**
 * 切换补光灯
 */
const toggleTorch = async () => {
  // #ifdef H5
  if (activeStream && cameraActive.value) {
    const track = activeStream.getVideoTracks()[0]
    if (track && 'applyConstraints' in track) {
      try {
        flashActive.value = !flashActive.value
        await (track as any).applyConstraints({
          advanced: [{ torch: flashActive.value }]
        })
        emit('torchChange', flashActive.value)
        uni.showToast({
          title: flashActive.value ? '补光灯已开启' : '补光灯已关闭',
          icon: 'none'
        })
        return
      } catch (e) {
        flashActive.value = false
        emit('torchChange', false)
        uni.showToast({ title: '当前摄像头硬件不支持补光灯', icon: 'none' })
        return
      }
    }
  }
  // #endif

  // #ifdef MP-WEIXIN
  if (currentDevicePosition.value === 'front') {
    uni.showToast({ title: '前置摄像头不支持补光灯', icon: 'none' })
    return
  }
  // #endif

  flashActive.value = !flashActive.value
  emit('torchChange', flashActive.value)
  uni.showToast({
    title: flashActive.value ? '补光灯已开启' : '补光灯已关闭',
    icon: 'none'
  })
}

/**
 * 从相册上传图片扫码识别
 */
const triggerFileInput = () => {
  // #ifdef H5
  const inputEl = document.getElementById('xview-file-input') as HTMLInputElement
  if (inputEl) {
    inputEl.value = ''
    inputEl.click()
  }
  // #endif

  // #ifdef MP-WEIXIN
  uni.scanCode({
    onlyFromCamera: false,
    scanType: ['qrCode'],
    success: (scanRes) => {
      if (scanRes.result) {
        emit('scan', scanRes.result)
      }
    },
    fail: (err) => {
      if (!err?.errMsg?.includes('cancel')) {
        uni.showToast({ title: '未能识别二维码', icon: 'none' })
      }
    }
  })
  // #endif

  // #ifndef H5 || MP-WEIXIN
  uni.chooseImage({
    count: 1,
    sourceType: ['album'],
    success: () => {
      uni.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode'],
        success: (scanRes) => {
          emit('scan', scanRes.result)
        }
      })
    }
  })
  // #endif
}

// #ifdef H5
const handleFileChange = async (event: Event) => {
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
    if (barcodeDetector) {
      try {
        const barcodes = await barcodeDetector.detect(img)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          recognizedText = barcodes[0].rawValue
        }
      } catch (e) {}
    }

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
      emit('scan', recognizedText)
    } else {
      uni.showToast({ title: '未在图片中识别出有效二维码', icon: 'none' })
    }
  } catch (err: any) {
    uni.hideLoading()
    uni.showToast({ title: '图片读取失败，请检查文件格式', icon: 'none' })
  }
}
// #endif

onMounted(() => {
  if (props.autoStart) {
    startCamera()
  }
})

onBeforeUnmount(() => {
  stopCamera()
})

defineExpose({
  startCamera,
  stopCamera,
  switchCamera,
  toggleTorch,
  triggerFileInput
})
</script>

<template>
  <view class="xview-viewer-root">
    <!-- 取景视口 -->
    <view class="xview-viewfinder">
      <!-- 1. H5 原生视频流容器 -->
      <!-- #ifdef H5 -->
      <div id="xviewCameraContainer" class="xview-video-container"></div>
      <!-- #endif -->

      <!-- 2. 微信小程序原生 camera 组件（支持 PC 开发者工具前置摄像头调用与原生扫码） -->
      <!-- #ifdef MP-WEIXIN -->
      <camera
        v-if="cameraActive"
        class="xview-native-camera-elem"
        :device-position="currentDevicePosition"
        :flash="flashActive ? 'torch' : 'off'"
        mode="scanCode"
        @scancode="onWxScanCode"
        @error="onWxCameraError"
        @initdone="onWxCameraInitDone"
      />
      <!-- #endif -->

      <!-- 3. 其他平台兜底容器 -->
      <!-- #ifndef H5 || MP-WEIXIN -->
      <view class="xview-video-container"></view>
      <!-- #endif -->

      <!-- 加载提示 -->
      <view v-show="cameraLoading" class="xview-overlay xview-loading">
        <view class="xview-spinner"></view>
        <text class="xview-tip-text">正在启动前置摄像头硬件...</text>
      </view>

      <!-- 未开启/异常遮罩 -->
      <view v-show="!cameraActive && !cameraLoading" class="xview-overlay xview-inactive">
        <svg class="xview-icon-off" viewBox="0 0 24 24">
          <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
        </svg>
        <text v-if="cameraError" class="xview-tip-text xview-error-text">{{ cameraError }}</text>
        <text v-else class="xview-tip-text">摄像头未开启或已暂停</text>
        <button class="xview-btn-reopen" @click="startCamera">开启摄像头</button>
      </view>

      <!-- 取景框科幻扫码辅助线与边角 -->
      <view class="xview-decor">
        <view class="xview-corner corner-tl"></view>
        <view class="xview-corner corner-tr"></view>
        <view class="xview-corner corner-bl"></view>
        <view class="xview-corner corner-br"></view>
        <view v-show="cameraActive && !props.scanLocked" class="xview-laser-line"></view>
        <view v-show="props.scanLocked" class="xview-scanned-badge">
          <text class="xview-badge-txt">✓ 扫描成功</text>
        </view>
      </view>
    </view>

    <!-- 摄像头控制条 -->
    <view class="xview-control-bar">
      <view class="xview-status-pill" :class="{ online: cameraActive }">
        <view class="xview-dot"></view>
        <text class="xview-status-label">{{ cameraActive ? (activeCameraLabel || '摄像头取景中') : '摄像头已停止' }}</text>
      </view>
      <view class="xview-action-group">
        <button v-if="cameraActive" class="xview-action-btn" @click="stopCamera">
          <svg class="xview-btn-icon" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M9,9H15V15H9V9Z"/></svg>
          <text>暂停</text>
        </button>
        <button v-else class="xview-action-btn primary" @click="startCamera">
          <svg class="xview-btn-icon" viewBox="0 0 24 24"><path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/></svg>
          <text>启动</text>
        </button>

        <!-- 切换镜头：微信小程序支持直接切换前后置，H5 支持多设备切换 -->
        <!-- #ifdef MP-WEIXIN -->
        <button class="xview-action-btn" @click="switchCamera">
          <svg class="xview-btn-icon" viewBox="0 0 24 24"><path d="M12,4V1L8,5L12,9V6C15.31,6 18,8.69 18,12C18,13.04 17.74,14.03 17.27,14.89L18.73,16.35C19.53,15.08 20,13.6 20,12A8,8 0 0,0 12,4M6.73,7.65C5.93,8.92 5.5,10.4 5.5,12A8,8 0 0,0 13.5,20V23L17.5,19L13.5,15V18C10.19,18 7.5,15.31 7.5,12C7.5,10.96 7.76,9.97 8.23,9.11L6.73,7.65Z"/></svg>
          <text>切镜头</text>
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button v-if="camerasList.length > 1" class="xview-action-btn" @click="switchCamera">
          <svg class="xview-btn-icon" viewBox="0 0 24 24"><path d="M12,4V1L8,5L12,9V6C15.31,6 18,8.69 18,12C18,13.04 17.74,14.03 17.27,14.89L18.73,16.35C19.53,15.08 20,13.6 20,12A8,8 0 0,0 12,4M6.73,7.65C5.93,8.92 5.5,10.4 5.5,12A8,8 0 0,0 13.5,20V23L17.5,19L13.5,15V18C10.19,18 7.5,15.31 7.5,12C7.5,10.96 7.76,9.97 8.23,9.11L6.73,7.65Z"/></svg>
          <text>切镜头</text>
        </button>
        <!-- #endif -->

        <button class="xview-action-btn" @click="triggerFileInput">
          <svg class="xview-btn-icon" viewBox="0 0 24 24"><path d="M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z"/></svg>
          <text>传图识别</text>
        </button>
      </view>

      <!-- H5 隐藏的文件选择输入控件 -->
      <!-- #ifdef H5 -->
      <input
        id="xview-file-input"
        type="file"
        accept="image/*"
        style="display: none;"
        @change="handleFileChange"
      />
      <!-- #endif -->
    </view>
  </view>
</template>

<style scoped>
.xview-viewer-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.xview-viewfinder {
  width: 520rpx;
  height: 520rpx;
  position: relative;
  border-radius: 20rpx;
  background-color: #020617;
  overflow: hidden;
  box-shadow: 0 0 60rpx rgba(64, 158, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.xview-video-container {
  width: 100% !important;
  height: 100% !important;
  position: relative !important;
  overflow: hidden !important;
  background-color: #020617 !important;
}

:deep(.xview-native-video-elem) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  background-color: #020617 !important;
}

/* 微信小程序原生 camera 组件填满取景器 */
.xview-native-camera-elem {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
}

.xview-overlay {
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

.xview-spinner {
  width: 50rpx;
  height: 50rpx;
  border: 4rpx solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: xview-spin 0.8s linear infinite;
}

@keyframes xview-spin {
  to { transform: rotate(360deg); }
}

.xview-icon-off {
  width: 64rpx;
  height: 64rpx;
  fill: #64748b;
  opacity: 0.6;
}

.xview-tip-text {
  font-size: 22rpx;
  color: #94a3b8;
  line-height: 1.4;
}

.xview-error-text {
  color: #f87171;
}

.xview-btn-reopen {
  margin-top: 10rpx;
  padding: 10rpx 28rpx;
  font-size: 22rpx;
  background: #0284c7;
  color: #ffffff;
  border-radius: 8rpx;
  border: none;
  font-weight: 600;
}

.xview-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.xview-corner {
  position: absolute;
  width: 40rpx;
  height: 40rpx;
  border-color: #2563eb;
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

.xview-laser-line {
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  height: 4rpx;
  background: linear-gradient(90deg, rgba(64, 158, 255, 0) 0%, #38bdf8 50%, rgba(64, 158, 255, 0) 100%);
  box-shadow: 0 0 16rpx #38bdf8;
  animation: xview-scan 2.2s ease-in-out infinite;
}

@keyframes xview-scan {
  0% { top: 30rpx; opacity: 0.8; }
  50% { top: 480rpx; opacity: 1; }
  100% { top: 30rpx; opacity: 0.8; }
}

.xview-scanned-badge {
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

.xview-badge-txt {
  background: #16a34a;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  padding: 12rpx 28rpx;
  border-radius: 30rpx;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.3);
}

.xview-control-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 12rpx 16rpx;
  background: rgba(30, 41, 59, 0.7);
  border-radius: 12rpx;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

.xview-status-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 22rpx;
  color: #94a3b8;
  max-width: 260rpx;
}

.xview-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #64748b;
  flex-shrink: 0;
}

.xview-status-pill.online .xview-dot {
  background: #22c55e;
  box-shadow: 0 0 10rpx #22c55e;
}

.xview-status-pill.online {
  color: #86efac;
}

.xview-status-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xview-action-group {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.xview-action-btn {
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

.xview-action-btn.primary {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.xview-action-btn:active {
  opacity: 0.8;
}

.xview-btn-icon {
  width: 22rpx;
  height: 22rpx;
  fill: currentColor;
}
</style>
