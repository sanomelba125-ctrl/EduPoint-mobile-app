# ===================================================================
# 学生活动打卡与积分商城 - 移动端 H5 容器化 Dockerfile
# ===================================================================
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build:h5

FROM nginx:alpine

# 拷贝 Nginx 路由代理配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝 Uni-app H5 编译静态产物
COPY --from=build /app/dist/build/h5/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
