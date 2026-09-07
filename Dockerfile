# ===================================================================
# 学生活动打卡与积分商城 - 移动端 H5 容器化 Dockerfile
# 基础镜像: 官方精简版 Nginx Alpine
# ===================================================================
FROM nginx:alpine

# 拷贝 Nginx 路由代理配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝 Uni-app H5 编译静态产物
COPY dist/build/h5/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
