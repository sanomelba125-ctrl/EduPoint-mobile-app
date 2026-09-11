<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { initStudentWebSocket } from '@/utils/websocket'

onLaunch(() => {
  console.log('App Launch: 学生活动打卡移动端启动')
  const userStore = useUserStore()
  if (userStore.isLoggedIn && userStore.userInfo?.id) {
    initStudentWebSocket(userStore.userInfo.id)
  }
})

onShow(() => {
  console.log('App Show')
  const userStore = useUserStore()
  if (userStore.isLoggedIn && userStore.userInfo?.id) {
    initStudentWebSocket(userStore.userInfo.id)
  }
})

onHide(() => {
  console.log('App Hide')
})
</script>

<style>
/* 全局公共样式与移动端盒子模型 */
page {
  background-color: #f5f6f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', sans-serif;
  box-sizing: border-box;
}

view, text, image {
  box-sizing: border-box;
}
</style>
