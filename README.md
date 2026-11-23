# 末班电台 · Terminal Radio

暴雨夜，求救者只看得清门檐上的一盏红灯。你有五次通话机会和一辆救援车。问清灯号，把证词带给值守员查档，再向电工核对停电记录，决定把车派往哪座站房。

## 开始游戏

下载并解压[游戏源码 ZIP](https://github.com/laozhej/terminal-radio/archive/refs/heads/main.zip)，双击 **末班电台.html**，点「接听」。预设问法可以离线玩完整局，无需安装或配置密钥。结案后，「重玩」重开当前案件，「下一通来电」会换一个求救地点。

也可以用 Git 取得同一份游戏：

```sh
git clone https://github.com/laozhej/terminal-radio.git
cd terminal-radio
```

## 自由提问（可选）

安装 Node.js 22 或更高版本，给本地服务进程设置环境变量 `MODELSCOPE_TOKEN`，然后在仓库目录运行：

```sh
node 末班电台服务.mjs
```

在浏览器打开 <http://127.0.0.1:8765/>。macOS 也可以双击 **启动末班电台.command**，在隐藏输入提示中填入令牌，或直接回车使用预设问法。

玩家输入的问题与引用的证词主题会发给魔搭，由模型识别提问意图。游戏根据本局线索给出角色回答。令牌需要有对应模型的推理权限，默认模型为 `Qwen/Qwen3.5-35B-A3B`，可用 `MODELSCOPE_MODEL` 更换。本地启动默认仅监听本机，端口可用 `RADIO_PORT` 更改。

## 部署到魔搭创空间

1. 在[魔搭创空间](https://modelscope.cn/studios)创建公开的 Docker 空间，选择可用的免费 CPU 规格。模型推理由魔搭 API 提供。
2. 在空间设置的环境变量中新增 **密文** `MODELSCOPE_TOKEN`，填入有模型推理权限的令牌。
3. 将仓库根目录的 `Dockerfile`、`.dockerignore`、`末班电台服务.mjs`、`末班电台.html` 和 `LICENSE` 同步到空间仓库根目录，点击部署。容器以 Node.js 22 在 `0.0.0.0:7860` 启动。密文更新后需重新部署。
4. 用未登录的浏览器打开空间展示页。点击「接听来电」，自由询问求救者「那盏灯每次亮多久，怎么交替？」，确认获得「求救证词」，再引用证词让灯号值守员查档。

## 修改与测试

页面、样式、地图、演出和案件逻辑在 `src/`。修改后用 Python 3 重新生成游戏入口：

```sh
python3 build.py src 末班电台.html
```

`npm test` 运行本地服务测试。模型响应使用测试替身，无需令牌。若要运行离线通关、自由提问界面、桌面和手机窄屏的随机案件，以及手机上的派车前核对测试，请先安装 Google Chrome，再执行：

```sh
npm ci
npm run test:browser
```

本项目采用 [MIT 许可证](LICENSE)。
