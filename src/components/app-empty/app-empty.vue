<template>
  <view class="app-empty">
    <view class="app-empty__icon">
      <app-icon :name="icon" :size="iconSize" color="#cbd5e1" :stroke-width="1.5" />
    </view>
    <text class="app-empty__title">{{ title }}</text>
    <text v-if="desc" class="app-empty__desc">{{ desc }}</text>
    <view v-if="$slots.default" class="app-empty__action">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 统一空状态组件。
 *
 * 背景：此前 5 个页面各写各的空状态，结构与观感都不一致 ——
 * 活动页是内联 SVG 灰色文件夹 + 一行字；礼品页 / 订单页 / 积分页是 emoji（📦📋🪙）+ 一行字；
 * 通知页又是另一套（带标题+描述两级）。用户看到的是"每页风格都不同"。
 *
 * 本组件统一为「线性图标 + 主标题 +（可选）说明 +（可选）操作插槽」，
 * 图标复用 app-icon，颜色统一用 slate-300，与页面其它线性图标同一套语言。
 *
 * 用法：
 *   <app-empty icon="inbox" title="暂无符合条件的校园活动" desc="换个筛选条件试试" />
 */
withDefaults(
  defineProps<{
    /** app-icon 中的图标名 */
    icon?: string
    /** 主标题（一句话说明"这里没有内容"） */
    title?: string
    /** 次级说明（可选，避免与页面标题重复，写"下一步能做什么"） */
    desc?: string
    /** 图标尺寸（rpx） */
    iconSize?: number
  }>(),
  {
    icon: 'inbox',
    title: '暂无数据',
    desc: '',
    iconSize: 112
  }
)
</script>

<style scoped>
.app-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 96rpx 48rpx;
  gap: 0;
}

.app-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 176rpx;
  height: 176rpx;
  border-radius: 50%;
  background-color: #f8fafc;
  margin-bottom: 28rpx;
}

.app-empty__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #64748b;
  text-align: center;
  line-height: 1.5;
}

.app-empty__desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #94a3b8;
  text-align: center;
  line-height: 1.6;
  max-width: 520rpx;
}

.app-empty__action {
  margin-top: 32rpx;
}
</style>
