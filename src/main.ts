// 学生端应用入口：导出 createApp 工厂，由 uni-app 运行时按目标平台（H5 / 微信小程序）调用
import { createSSRApp } from 'vue'
import * as Pinia from 'pinia'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = Pinia.createPinia()
  app.use(pinia)
  return {
    app,
    Pinia
  }
}

