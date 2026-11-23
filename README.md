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

玩家输入的问题与引用的证词主题会发给魔搭，由模型识别提问意图。游戏根据本局线索给出角色回答。令牌需要有对应模型的推理权限，默认模型为 `Qwen/Qwen3.5-35B-A3B`，可用 `MODELSCOPE_MODEL` 更换。服务仅监听本机，端口可用 `RADIO_PORT` 更改。

## 修改与测试

页面、样式、地图、演出和案件逻辑在 `src/`。修改后用 Python 3 重新生成游戏入口：

```sh
python3 build.py src 末班电台.html
```

`npm test` 运行本地服务测试。模型响应使用测试替身，无需令牌。若要运行离线通关、自由提问界面及桌面和手机窄屏的随机案件测试，请先安装 Google Chrome，再执行：

```sh
npm ci
npm run test:browser
```

本项目采用 [MIT 许可证](LICENSE)。
