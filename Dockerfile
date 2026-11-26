FROM node:22-bookworm-slim
WORKDIR /app
COPY ["末班电台.html", "末班电台服务.mjs", "LICENSE", "./"]
USER node
EXPOSE 7860
CMD ["node", "末班电台服务.mjs", "--studio"]
