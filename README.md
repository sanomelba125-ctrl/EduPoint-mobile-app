# 学生活动打卡与积分商城 - 学生移动端 (Mobile App)

基于 **Uni-app**（**Vue 3** + **Vite** + **TypeScript**）跨端开发框架构建的学生端移动应用，支持直接编译运行为 **H5 移动 Web 端** 与 **微信小程序 (MP-Weixin)**。

---

## 📱 核心功能模块 (TabBar)

1. **活动打卡大厅 (`pages/activity/index`)**：浏览最新校园活动发布、地点区间校验、打卡签到领取积分。
2. **积分兑换商城 (`pages/gift/index`)**：浏览可兑换礼品库、扣减积分申请兑换、生成提货核销码。
3. **全校积分排行榜 (`pages/rank/index`)**：学生积分榜单与成就激励排名。
4. **个人中心 (`pages/my/index`)**：学籍档案身份绑定、当前可用积分、打卡记录流水与礼品领取记录。

---

## 🛠️ 技术架构

- **核心规范**：Uni-app Vue 3 规范
- **构建工具**：Vite 5
- **网络请求**：基于 `uni.request` 封装的通用跨端 HTTP 客户端（自动注入 Sa-Token 鉴权 Token）
- **类型支持**：TypeScript + @dcloudio/types

---

## 🚀 启动与编译指令

```bash
# 1. 安装项目依赖
npm install

# 2. 运行为 H5 网页版 (本地开发推荐，默认端口 5173)
npm run dev:h5

# 3. 编译为微信小程序版 (编译产物位于 dist/dev/mp-weixin，可直接导入微信开发者工具)
npm run dev:mp-weixin

# 4. H5 生产环境打包
npm run build:h5

# 5. 微信小程序生产环境打包
npm run build:mp-weixin
```
