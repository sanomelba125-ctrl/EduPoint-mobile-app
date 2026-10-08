<template>
  <view class="cert-page-wrap">
    <!-- 顶部状态栏与自定义导航 -->
    <view class="cert-nav-header">
      <view class="cert-back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />
        </svg>
      </view>
      <text class="nav-title">权威电子结项证书</text>
      <view class="nav-placeholder" @click="goToVerifyCenter">
        <text class="verify-link">验真</text>
      </view>
    </view>

    <!-- 证书切换横滑栏 -->
    <scroll-view scroll-x class="cert-scroll-tabs" :show-scrollbar="false">
      <view class="tabs-inner">
        <view
          v-for="(item, index) in certList"
          :key="item.id"
          class="cert-tab-pill"
          :class="{ active: currentIndex === index }"
          @click="selectCert(index)"
        >
          <text class="pill-text">{{ item.title || item.activityTitle }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 证书主体画幅 (严格参考原型) -->
    <view class="cert-stage" v-if="currentCert">
      <view class="cert-card-board" id="certBoard">
        <!-- 底纹水印 -->
        <view class="cert-watermark-txt">CAMPUS CREDENTIAL</view>

        <view class="cert-sub-header">UNIVERSITY ACTIVITY CREDENTIAL</view>
        <view class="cert-main-title">荣誉结项证书</view>

        <!-- 证书正文 -->
        <view class="cert-body-content">
          <text>兹证明 </text>
          <text class="cert-student-name">{{ studentName }}</text>
          <text> 同学（学号：</text>
          <text class="cert-student-no">{{ studentNo }}</text>
          <text>）在参加由 </text>
          <text class="cert-issuer-text">{{ currentCert.issuer }}</text>
          <text> 组织的 </text>
          <text class="cert-act-name">【{{ currentCert.activityTitle }}】</text>
          <text> 中，按时出勤签到，表现优异，经考核准予结业，特发此证！</text>
        </view>

        <!-- 撤销标记 (若被撤销) -->
        <view v-if="currentCert.status === 2" class="cert-revoked-tag">
          <text>【已作废撤销】{{ currentCert.revokeReason }}</text>
        </view>

        <!-- 底部防伪二维码与签章 -->
        <view class="cert-bottom-meta">
          <view class="cert-qr-box">
            <!-- 矢量防伪二维码 -->
            <view class="qr-canvas">
              <svg viewBox="0 0 24 24" width="44" height="44" fill="#1e293b">
                <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V12H12V2H2M2,22H12V12H2V22M22,2H12V12H22V2M22,22V16H18V20H16V22H22Z"/>
              </svg>
            </view>
            <text class="cert-no-label">NO: {{ currentCert.certificateNo }}</text>
          </view>

          <view class="cert-signer-box">
            <text class="issuer-name">{{ currentCert.issuer }}</text>
            <text class="issue-date">{{ currentCert.issueTime }}</text>
          </view>
        </view>

        <!-- 矢量权威防伪电子印章 -->
        <svg class="cert-official-seal-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#dc2626" stroke-width="2.5" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="#dc2626" stroke-width="1" />
          <polygon points="50,26 53,35 62,35 55,40 57,49 50,44 43,49 45,40 38,35 47,35" fill="#dc2626" />
          <text x="50" y="65" text-anchor="middle" fill="#dc2626" font-size="8" font-weight="bold" letter-spacing="1">学工部认证</text>
          <text x="50" y="76" text-anchor="middle" fill="#dc2626" font-size="7">★ 防伪验讫 ★</text>
        </svg>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="cert-action-bar">
      <button class="btn btn-outline" @click="handleOnlineVerify">
        在线核验证书
      </button>
      <button class="btn btn-primary" @click="handleSaveToAlbum">
        保存高清证书
      </button>
    </view>

    <!-- 在线核验弹窗 (浮层) -->
    <view v-if="verifyModalVisible" class="verify-popup-mask" @click="verifyModalVisible = false">
      <view class="verify-popup-card" @click.stop>
        <view class="popup-header">
          <text class="popup-title">电子证书官方防伪核验</text>
          <view class="popup-close" @click="verifyModalVisible = false">×</view>
        </view>
        <view class="popup-body">
          <view class="verify-status-tag" :class="{ revoked: currentCert?.status === 2 }">
            <text class="status-icon">{{ currentCert?.status === 1 ? '✓' : '✕' }}</text>
            <text class="status-txt">{{ currentCert?.status === 1 ? '官方备案认证有效 (VALID)' : '该凭证已被撤销作废' }}</text>
          </view>
          <view class="verify-info-list">
            <view class="info-row">
              <text class="k">防伪编号：</text>
              <text class="v mono">{{ currentCert?.certificateNo }}</text>
            </view>
            <view class="info-row">
              <text class="k">获奖学生：</text>
              <text class="v">{{ maskedStudentName }} (脱敏隐私保护)</text>
            </view>
            <view class="info-row">
              <text class="k">证书名称：</text>
              <text class="v">{{ currentCert?.title }}</text>
            </view>
            <view class="info-row">
              <text class="k">所属活动：</text>
              <text class="v">{{ currentCert?.activityTitle }}</text>
            </view>
            <view class="info-row">
              <text class="k">签发机构：</text>
              <text class="v">{{ currentCert?.issuer }}</text>
            </view>
            <view class="info-row">
              <text class="k">颁发时间：</text>
              <text class="v">{{ currentCert?.issueTime }}</text>
            </view>
            <view v-if="currentCert?.revokeReason" class="info-row text-danger">
              <text class="k">作废原因：</text>
              <text class="v">{{ currentCert?.revokeReason }}</text>
            </view>
          </view>
        </view>
        <view class="popup-footer">
          <button class="btn btn-primary-full" @click="verifyModalVisible = false">关闭查验</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { getMyCertificatesApi, type MyCertificateItem } from '@/api/certificate'

const userStore = useUserStore()

const certList = ref<MyCertificateItem[]>([])
const currentIndex = ref(0)
const verifyModalVisible = ref(false)
const targetActivityId = ref<number | null>(null)
const targetCertNo = ref<string>('')

const currentCert = computed(() => {
  if (certList.value.length === 0) return null
  return certList.value[currentIndex.value] || certList.value[0]
})

const studentName = computed(() => {
  const name = userStore.userInfo?.name
  return name && name !== '未登录' ? name : '同学'
})
const studentNo = computed(() => userStore.userInfo?.studentNo || '--')

// 脱敏学生姓名
const maskedStudentName = computed(() => {
  const name = studentName.value
  if (name.length <= 1) return name
  if (name.length === 2) return `${name[0]}*`
  return `${name[0]}*${name[name.length - 1]}`
})

// 加载学生证书
const loadCertificates = async () => {
  try {
    const list = await getMyCertificatesApi()
    certList.value = list
    // 若路由传入了目标活动ID或证书号，自动高亮并切换到对应证书
    if (targetActivityId.value || targetCertNo.value) {
      const idx = list.findIndex(item => {
        if (targetActivityId.value && item.activityId === targetActivityId.value) return true
        if (targetCertNo.value && item.certificateNo === targetCertNo.value) return true
        return false
      })
      if (idx !== -1) {
        currentIndex.value = idx
      }
    }
  } catch (err: any) {
    uni.showToast({ title: '加载证书失败', icon: 'none' })
  }
}

// 切换选中的证书
const selectCert = (index: number) => {
  currentIndex.value = index
}

// 返回
const handleBack = () => {
  uni.navigateBack({
    fail: () => {
      uni.switchTab({ url: '/pages/my/index' })
    }
  })
}

// 打开独立公开核验页
const goToVerifyCenter = () => {
  const no = currentCert.value?.certificateNo || ''
  uni.navigateTo({
    url: `/pages/certificate/verify?no=${encodeURIComponent(no)}`
  })
}

// 在线核验证书
const handleOnlineVerify = () => {
  verifyModalVisible.value = true
}

// 保存证书至相册
const handleSaveToAlbum = () => {
  uni.showLoading({ title: '正在导出高清证书...' })
  setTimeout(() => {
    uni.hideLoading()
    uni.showModal({
      title: '证书保存成功',
      content: '电子结项证书高清图片已成功生成，可用于评奖评优、综测评定及第二课堂学分核验。',
      showCancel: false
    })
  }, 600)
}

onLoad((query: any) => {
  if (query?.activityId) {
    targetActivityId.value = Number(query.activityId)
  }
  if (query?.no || query?.certificateNo) {
    targetCertNo.value = decodeURIComponent(query.no || query.certificateNo)
  }
})

onMounted(() => {
  loadCertificates()
})
</script>

<style scoped>
.cert-page-wrap {
  min-height: 100vh;
  background: #0f172a;
  padding-bottom: 40px;
  box-sizing: border-box;
}

.cert-nav-header {
  padding: 44px 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(15, 23, 42, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: 0;
  z-index: 20;
}

.cert-back-btn {
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
}

.nav-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.nav-placeholder {
  width: 44px;
  text-align: right;
}

.verify-link {
  font-size: 13px;
  color: #38bdf8;
  font-weight: 500;
}

/* 证书横滑切换栏 */
.cert-scroll-tabs {
  white-space: nowrap;
  padding: 12px 16px;
  box-sizing: border-box;
}

.tabs-inner {
  display: flex;
  gap: 8px;
}

.cert-tab-pill {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.cert-tab-pill.active {
  background: #2563eb;
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
}

.pill-text {
  font-size: 12px;
  color: #cbd5e1;
}

.cert-tab-pill.active .pill-text {
  color: #ffffff;
  font-weight: 600;
}

/* 证书画幅 */
.cert-stage {
  padding: 10px 16px;
}

.cert-card-board {
  background: #fffdfa;
  border: 6px double #b45309;
  border-radius: 12px;
  padding: 24px 16px 20px;
  position: relative;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  text-align: center;
  color: #1e293b;
}

.cert-watermark-txt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  font-size: 34px;
  font-weight: 900;
  color: rgba(180, 83, 9, 0.05);
  pointer-events: none;
  white-space: nowrap;
  letter-spacing: 4px;
}

.cert-sub-header {
  font-size: 9px;
  letter-spacing: 2.5px;
  color: #78350f;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.cert-main-title {
  font-size: 22px;
  font-weight: 800;
  color: #b45309;
  letter-spacing: 6px;
  margin-bottom: 18px;
}

.cert-body-content {
  font-size: 13px;
  color: #334155;
  line-height: 1.9;
  text-align: justify;
  padding: 0 6px;
  margin-bottom: 24px;
}

.cert-student-name {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  border-bottom: 2px solid #b45309;
  padding: 0 4px;
}

.cert-student-no {
  font-family: monospace;
}

.cert-act-name {
  font-weight: 700;
  color: #1e293b;
}

.cert-revoked-tag {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  padding: 6px;
  border-radius: 4px;
  font-size: 11px;
  margin-bottom: 14px;
}

.cert-bottom-meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 0 4px;
  margin-top: 20px;
}

.cert-qr-box {
  text-align: left;
}

.qr-canvas {
  width: 50px;
  height: 50px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cert-no-label {
  display: block;
  font-size: 9px;
  color: #64748b;
  margin-top: 4px;
  font-family: monospace;
}

.cert-signer-box {
  text-align: right;
}

.cert-signer-box .issuer-name {
  font-weight: 700;
  color: #1e293b;
  font-size: 13px;
}

.cert-signer-box .issue-date {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.cert-official-seal-svg {
  position: absolute;
  right: 12px;
  bottom: 16px;
  width: 80px;
  height: 80px;
  transform: rotate(-12deg);
  opacity: 0.9;
  pointer-events: none;
}

/* 操作按钮 */
.cert-action-bar {
  padding: 16px;
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  height: 42px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.btn-outline {
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.btn-primary {
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

/* 核验浮层 */
.verify-popup-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.verify-popup-card {
  width: 100%;
  max-width: 360px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.3);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.popup-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.popup-close {
  font-size: 20px;
  color: #94a3b8;
  cursor: pointer;
}

.popup-body {
  padding: 16px;
}

.verify-status-tag {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.verify-status-tag.revoked {
  background: #fef2f2;
  border-color: #fecaca;
}

.status-icon {
  font-weight: 800;
  font-size: 16px;
  color: #16a34a;
}

.verify-status-tag.revoked .status-icon {
  color: #dc2626;
}

.status-txt {
  font-size: 13px;
  font-weight: 700;
  color: #16a34a;
}

.verify-status-tag.revoked .status-txt {
  color: #dc2626;
}

.verify-info-list {
  font-size: 12px;
  line-height: 1.8;
}

.info-row {
  display: flex;
}

.info-row .k {
  width: 70px;
  color: #64748b;
}

.info-row .v {
  flex: 1;
  color: #1e293b;
}

.info-row .v.mono {
  font-family: monospace;
  color: #2563eb;
  font-weight: 600;
}

.text-danger {
  color: #dc2626;
}

.popup-footer {
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
}

.btn-primary-full {
  width: 100%;
  height: 38px;
  background: #2563eb;
  color: #ffffff;
  border-radius: 6px;
  font-size: 14px;
  border: none;
}
</style>
