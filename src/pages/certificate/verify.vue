<template>
  <view class="verify-page-wrap">
    <!-- 顶部导航 -->
    <view class="verify-header">
      <view class="back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />
        </svg>
      </view>
      <text class="header-title">官方防伪查验平台</text>
      <view style="width: 32px;"></view>
    </view>

    <!-- 检索框卡片 -->
    <view class="search-card">
      <view class="search-intro">
        <text class="intro-title">电子荣誉证书真伪核验</text>
        <text class="intro-desc">请输入电子凭证唯一防伪 UUID 编号进行公开溯源核验</text>
      </view>

      <view class="input-row">
        <input
          v-model="inputCode"
          class="cert-input"
          placeholder="例: CERT-2026-ACT2-A89F3B12"
          placeholder-class="input-placeholder"
          @confirm="handleVerify"
        />
        <button class="verify-btn" :loading="loading" @click="handleVerify">查验</button>
      </view>

      <view class="quick-tags">
        <text class="quick-title">快捷体验：</text>
        <text class="tag-link" @click="selectTag('CERT-2026-ACT2-A89F3B12')">有效证书</text>
        <text class="tag-link danger" @click="selectTag('CERT-2026-ACT3-REVOKED01')">已撤销证书</text>
      </view>
    </view>

    <!-- 核验结果展示 -->
    <view v-if="result" class="result-wrap">
      <view class="result-card" :class="{ revoked: result.status === 2 }">
        <!-- 头部状态标识 -->
        <view class="status-banner">
          <view class="status-badge-icon">
            <svg v-if="result.status === 1" viewBox="0 0 24 24" width="28" height="28" fill="#16a34a">
              <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1M10 16.5L6 12.5L7.41 11.09L10 13.67L16.59 7.08L18 8.5L10 16.5Z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="#dc2626">
              <path d="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z"/>
            </svg>
          </view>
          <view class="status-texts">
            <text class="status-main">{{ result.statusText }}</text>
            <text class="status-sub">
              {{ result.status === 1 ? '官方数字签名校验通过，该凭证真实受保' : '校方已撤销作废该荣誉凭证' }}
            </text>
          </view>
        </view>

        <!-- 详细信息清单（隐私保护脱敏） -->
        <view class="info-list">
          <view class="info-item">
            <text class="item-label">防伪编号：</text>
            <text class="item-value mono">{{ result.certificateNo }}</text>
          </view>

          <view class="info-item">
            <text class="item-label">获奖学生：</text>
            <view class="item-value">
              <text class="name-text">{{ result.studentNameMasked }}</text>
              <text class="privacy-badge">隐私脱敏保护</text>
            </view>
          </view>

          <view class="info-item">
            <text class="item-label">证书名称：</text>
            <text class="item-value font-bold">{{ result.title }}</text>
          </view>

          <view class="info-item">
            <text class="item-label">归属活动：</text>
            <text class="item-value">{{ result.activityTitle }}</text>
          </view>

          <view class="info-item">
            <text class="item-label">签发机构：</text>
            <text class="item-value">{{ result.issuer }}</text>
          </view>

          <view class="info-item">
            <text class="item-label">颁发日期：</text>
            <text class="item-value">{{ result.issueTime }}</text>
          </view>

          <view v-if="result.revokeReason" class="info-item revoke-box">
            <text class="item-label text-danger">撤销原因：</text>
            <text class="item-value text-danger font-bold">{{ result.revokeReason }}</text>
          </view>

          <view class="info-item time-item">
            <text class="item-label">查验时间：</text>
            <text class="item-value">{{ result.verifyTime }}</text>
          </view>
        </view>

        <!-- 底部公信力说明 -->
        <view class="card-footer">
          <text class="footer-note">EduPoint 校园活动积分与第二课堂防伪溯源体系认证</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { verifyCertificateApi, type VerifyCertificateResult } from '@/api/certificate'

const inputCode = ref('CERT-2026-ACT2-A89F3B12')
const loading = ref(false)
const result = ref<VerifyCertificateResult | null>(null)

onLoad((options: any) => {
  if (options && options.no) {
    inputCode.value = decodeURIComponent(options.no)
  }
})

onMounted(() => {
  if (inputCode.value) {
    handleVerify()
  }
})

const selectTag = (no: string) => {
  inputCode.value = no
  handleVerify()
}

const handleVerify = async () => {
  const code = inputCode.value.trim()
  if (!code) {
    uni.showToast({ title: '请输入证书防伪编号', icon: 'none' })
    return
  }

  loading.value = true
  try {
    const res = await verifyCertificateApi(code)
    result.value = res
  } catch (err: any) {
    uni.showToast({ title: err.message || '核验未通过，请核查编号', icon: 'none' })
    result.value = null
  } finally {
    loading.value = false
  }
}

const handleBack = () => {
  uni.navigateBack({
    fail: () => {
      uni.switchTab({ url: '/pages/my/index' })
    }
  })
}
</script>

<style scoped>
.verify-page-wrap {
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: 40px;
}

.verify-header {
  padding: 44px 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

.back-btn {
  color: #1e293b;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.search-card {
  margin: 16px;
  background: #ffffff;
  border-radius: 12px;
  padding: 18px 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.search-intro {
  margin-bottom: 14px;
}

.intro-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  display: block;
}

.intro-desc {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
  display: block;
}

.input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.cert-input {
  flex: 1;
  height: 42px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-family: monospace;
}

.input-placeholder {
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.verify-btn {
  width: 80px;
  height: 42px;
  background: #2563eb;
  color: #ffffff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.quick-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-title {
  font-size: 12px;
  color: #94a3b8;
}

.tag-link {
  font-size: 12px;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.tag-link.danger {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fee2e2;
}

.result-wrap {
  padding: 0 16px;
}

.result-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #86efac;
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.08);
  overflow: hidden;
}

.result-card.revoked {
  border-color: #fca5a5;
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.08);
}

.status-banner {
  background: #f0fdf4;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #dcfce7;
}

.result-card.revoked .status-banner {
  background: #fef2f2;
  border-bottom-color: #fee2e2;
}

.status-badge-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.status-texts {
  display: flex;
  flex-direction: column;
}

.status-main {
  font-size: 16px;
  font-weight: 700;
  color: #16a34a;
}

.result-card.revoked .status-main {
  color: #dc2626;
}

.status-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.info-list {
  padding: 16px;
}

.info-item {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px dashed #f1f5f9;
  font-size: 13px;
  line-height: 1.6;
}

.info-item:last-child {
  border-bottom: none;
}

.item-label {
  width: 76px;
  color: #64748b;
  flex-shrink: 0;
}

.item-value {
  flex: 1;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-value.mono {
  font-family: monospace;
  color: #2563eb;
  font-weight: 600;
}

.name-text {
  font-weight: 700;
}

.privacy-badge {
  font-size: 10px;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 1px 6px;
  border-radius: 4px;
}

.font-bold {
  font-weight: 700;
}

.revoke-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 8px 10px;
  border-radius: 6px;
  margin: 6px 0;
}

.text-danger {
  color: #dc2626;
}

.time-item {
  font-size: 11px;
}

.time-item .item-label,
.time-item .item-value {
  color: #94a3b8;
}

.card-footer {
  background: #f8fafc;
  padding: 10px 16px;
  text-align: center;
  border-top: 1px solid #f1f5f9;
}

.footer-note {
  font-size: 11px;
  color: #94a3b8;
}
</style>
