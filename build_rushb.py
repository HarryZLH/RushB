from __future__ import annotations

import json
import os
import shutil
import struct
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
BILIDOWN_DIR = os.environ.get("BILIDOWN_DIR")
SOURCE = Path(BILIDOWN_DIR) if BILIDOWN_DIR else None
OUTPUT = Path(os.environ.get("RUSHB_OUTPUT", str(PROJECT_ROOT / "dist")))
ASAR = SOURCE / "resources" / "app.asar" if SOURCE else None

JS_SOURCE = PROJECT_ROOT / "src" / "rushb_ui.js"
CSS_SOURCE = PROJECT_ROOT / "src" / "rushb_ui.css"
EXTENSION_SOURCE = PROJECT_ROOT / "browser-extension"
LAUNCHER_SOURCE = PROJECT_ROOT / "launcher"
BACKDROP_SOURCE = LAUNCHER_SOURCE / "Set-RushBBackdrop.ps1"


INDEX_HTML = r'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>RushB（B站视频下载器）</title>
  <link href="./assets/css/chunk-vendors.00d3c6de.css" rel="stylesheet">
  <link href="./assets/css/app.cfce7cff.css" rel="stylesheet">
  <link href="./assets/css/rushb-ui.css" rel="stylesheet">
  <script defer src="./assets/js/chunk-vendors.6f104f4c.js"></script>
  <script defer src="./assets/js/app.8ec346bd.js"></script>
  <script defer src="./assets/js/rushb-ui.js"></script>
</head>
<body>
  <div id="app"></div>
  <div id="batch-shell">
    <header class="app-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M12.15 2.55 6.2 10.1c-.32.41-.03.99.49.99h3.03l-1.08 5.94c-.13.69.5.96.91.38l5.8-7.63c.32-.42.03-1-.49-1h-3l1.16-5.82c.14-.7-.45-.98-.87-.41Z"/></svg></span><span>RushB（B站视频下载器）</span></div>
      <div class="window-actions">
        <button id="download-status-button" class="download-status" type="button" data-state="idle" aria-haspopup="dialog" aria-expanded="false" aria-controls="download-panel" aria-label="下载状态：空闲；点击打开下载任务面板" title="下载状态：空闲；点击打开下载任务面板">
          <span class="download-status-arrow" aria-hidden="true">&#8595;</span>
          <span class="download-status-dot" aria-hidden="true"></span>
        </button>
        <button id="settings-button" aria-label="设置" title="设置" aria-controls="settings-view" aria-expanded="false">&#9881;</button>
        <button id="minimize-window" aria-label="最小化">&#8212;</button>
        <button id="maximize-window" aria-label="最大化">&#9633;</button>
        <button id="close-window" aria-label="关闭">&#215;</button>
      </div>
    </header>
    <main class="workbench">
      <section class="input-card">
        <textarea id="batch-links" spellcheck="false" placeholder="粘贴 B 站视频链接，每行一个"></textarea>
        <div class="input-meta">
          <span id="link-count">0 个链接</span>
        </div>
      </section>
      <button id="start-download">一键下载</button>
      <div id="batch-status" role="status" aria-live="polite"></div>
    </main>
    <main id="settings-view" class="settings-view" hidden>
      <div class="settings-intro">
        <button id="back-to-home" class="text-button back-button">&#8592; 返回下载器</button>
        <p class="eyebrow">设置</p>
        <h1>账号与下载</h1>
      </div>
      <section class="login-settings-group" aria-label="账号与登录">
        <p class="section-title login-group-title">账号与登录</p>
        <section class="settings-card account-card">
          <div class="account-heading"><span>登录状态</span><span id="account-status" class="status-pill">正在检查</span></div>
          <div id="account-identity" class="account-identity">正在读取当前 RushB 账号…</div>
          <p class="settings-hint">高画质与高音质按当前账号权限自动选择。</p>
        </section>
        <p class="section-title login-method-title">登录方式</p>
        <div class="login-methods">
          <label class="method-card">
            <input type="radio" name="login-method" value="browser">
            <span><strong>从浏览器获取</strong><small>导入 Edge / Chrome 中已登录的 B 站账号</small></span>
          </label>
          <label class="method-card">
            <input type="radio" name="login-method" value="manual">
            <span><strong>自行登录</strong><small>在 RushB 内使用 B 站扫码登录</small></span>
          </label>
        </div>
        <section id="browser-method" class="settings-card method-panel">
          <p>请先在系统默认浏览器登录 B 站并加载随程序提供的扩展；点击下方按钮后会在该浏览器打开本地导入页。</p>
          <div class="settings-actions">
            <button id="browser-import" class="settings-primary">从浏览器获取登录状态</button>
            <button id="open-extension-folder" class="text-button">打开扩展目录</button>
          </div>
          <div id="browser-import-status" class="method-status" role="status"></div>
        </section>
        <section id="manual-method" class="settings-card method-panel" hidden>
          <p>打开 RushB 账号页，使用 B 站客户端扫码登录；登录完成后返回此页刷新账号状态。</p>
          <button id="open-manual-login" class="settings-primary">打开扫码登录</button>
        </section>
      </section>
      <section class="settings-card download-settings">
        <div class="account-heading"><span>下载设置</span><span class="settings-value">最高可用画质 / 音质</span></div>
        <div class="save-row settings-save-row">
          <span class="save-label">保存到</span>
          <span id="settings-save-path"></span>
          <button id="settings-choose-folder" class="text-button">更改</button>
        </div>
      </section>
      <p class="section-title">关于</p>
      <button id="about-button" class="settings-card about-button" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="about-dialog">
        <span class="about-button-copy"><strong>软件声明</strong><small>项目来源、使用规范、隐私说明与免责声明</small></span>
        <span class="about-button-chevron" aria-hidden="true">&#8250;</span>
      </button>
    </main>
    <div id="about-dialog" class="about-overlay" hidden>
      <section class="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
        <header class="about-dialog-header">
          <div><p class="eyebrow">RushB（B站视频下载器）</p><h2 id="about-dialog-title">软件声明</h2></div>
          <button id="about-close" class="about-close" type="button" aria-label="关闭软件声明">&#215;</button>
        </header>
        <div class="about-dialog-body" tabindex="-1">
          <p class="about-lead">非官方个人改版 <span>·</span> 更新日期：2026 年 11 月 2 日</p>
          <section class="about-section">
            <h3>项目来源</h3>
            <p>RushB 基于 B 站 UP 主 <strong>@王子周棋洛</strong> 的 Bilidown 魔改。原项目已停止维护，现由 <strong>@Harry张</strong> 进行优化更新。</p>
            <p>RushB 为非官方个人改版，与哔哩哔哩平台及原作者不存在隶属、官方合作或背书关系。原项目是否公开源代码及其许可证范围尚未核实；相关著作权和许可范围以权利人公开信息及适用许可证为准，本改版不代表获得了超出原许可的授权。</p>
          </section>
          <section class="about-section">
            <h3>功能与数据处理</h3>
            <p>RushB 在本机运行，提供链接解析和下载界面，不提供视频上传、托管或对外分享服务。解析、账号校验和下载需要连接 B 站相关服务，实际可用画质取决于视频资源、账号权限及平台接口。</p>
            <p>选择“从浏览器获取”时，扩展会将本次导入所需的 B 站登录 Cookie 经本机 127.0.0.1 一次性连接传给 RushB，再写入本机 Electron 登录会话。登录会话存放在 Windows 用户的 Bilidown 数据目录（%APPDATA%\bilidown），并与 Bilidown 共用。Cookie 可代表账号访问权限，请妥善保管设备和账号。</p>
          </section>
          <section class="about-section">
            <h3>内容权利与使用规范</h3>
            <p>视频、音频、字幕及其他内容的著作权和相关权益归相应权利人所有；上传者不一定是全部内容的权利人。RushB 不授予用户下载、复制、改编、传播或商业使用任何内容的权利。</p>
            <p>使用前应确认自己已取得必要授权，或有适用法律依据，并遵守 B 站现行规则。仅供个人学习、研究或欣赏等用途，并不当然意味着取得授权或适用法定例外。</p>
            <p>未经权利人许可，不得将下载内容再次上传、公开传播、销售或用于商业用途；不得利用本软件绕过付费、账号权限、技术保护措施或访问限制。</p>
          </section>
          <section class="about-section">
            <h3>免责声明</h3>
            <p>软件按现状提供，不保证解析与下载持续可用、结果完整、速度稳定或兼容所有设备。平台接口、网络环境、账号权限、系统依赖或第三方组件变化，都可能导致功能受限或失败。请在下载前核对链接和保存位置，并自行管理本地文件及备份。</p>
            <p>用户应对其账号、下载内容及后续使用行为负责。因未经授权使用内容、违反平台规则、保管不当或操作不当产生的后果，由实施相关行为的用户依法承担相应责任。法律允许的范围内，开发者不对第三方服务变化、网络中断或用户行为造成的损失承担超出法律规定的责任；本条不排除依法不得排除或限制的责任。</p>
          </section>
          <section class="about-section">
            <h3>免费与分发</h3>
            <p>RushB 面向个人免费使用，禁止以任何付费方式售卖、分发或将其打包收费。重新分发本改版时应保留来源说明，不得冒称官方，并应遵守适用许可证。</p>
          </section>
        </div>
        <footer class="about-dialog-footer">
          <button id="about-acknowledge" class="settings-primary" type="button">已阅读</button>
        </footer>
      </section>
    </div>
    <section id="download-panel" class="download-panel" role="dialog" aria-modal="false" aria-labelledby="download-panel-title" hidden>
      <header class="download-panel-header">
        <div><h2 id="download-panel-title">下载任务</h2><p id="download-panel-summary">正在读取任务…</p></div>
        <div class="download-panel-header-actions">
          <button id="download-panel-open-folder" class="download-panel-folder" type="button" title="打开保存位置">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.7 5.4a1.4 1.4 0 0 1 1.4-1.4h4l1.7 1.8h6.1a1.4 1.4 0 0 1 1.4 1.4v7.4A1.4 1.4 0 0 1 15.9 16H4.1a1.4 1.4 0 0 1-1.4-1.4V5.4Z"/><path d="M2.9 7.1h13.9"/></svg>
            <span>打开保存位置</span>
          </button>
          <button id="download-panel-close" class="download-panel-close" type="button" aria-label="关闭下载任务面板">&#215;</button>
        </div>
      </header>
      <div class="download-tabs" role="tablist" aria-label="下载任务分类">
        <button id="download-tab-active" class="download-tab is-selected" type="button" role="tab" aria-selected="true" aria-controls="download-active-list">正在进行 <span id="download-active-count">0</span></button>
        <button id="download-tab-completed" class="download-tab" type="button" role="tab" aria-selected="false" aria-controls="download-completed-list">已下载 <span id="download-completed-count">0</span></button>
        <button id="download-clear-records" class="download-clear-records" type="button" aria-label="清理已下载记录" title="清理已下载记录，不删除本地视频文件" hidden>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6.2h11l-.7 9.1a1.4 1.4 0 0 1-1.4 1.3H6.6a1.4 1.4 0 0 1-1.4-1.3l-.7-9.1Z"/><path d="M3 4.5h14M7.3 4.5l.6-1.4h4.2l.6 1.4M8 8.3v5.4m4-5.4v5.4"/></svg>
          <span>清理</span>
        </button>
      </div>
      <div id="download-active-list" class="download-list" role="tabpanel" aria-labelledby="download-tab-active"></div>
      <div id="download-completed-list" class="download-list" role="tabpanel" aria-labelledby="download-tab-completed" hidden></div>
    </section>
    <div id="series-picker" class="series-picker" hidden>
      <section class="series-dialog" role="dialog" aria-modal="true" aria-labelledby="series-picker-title">
        <div class="series-dialog-heading">
          <div>
            <p class="eyebrow">系列视频</p>
            <h2 id="series-picker-title">选择要下载的视频</h2>
            <p id="series-picker-subtitle" class="series-subtitle"></p>
          </div>
          <span class="series-count"><strong id="series-selected-count">0</strong> / <span id="series-total-count">0</span> 集</span>
        </div>
        <div class="series-toolbar">
          <button id="series-toggle-all" class="text-button">全选</button>
          <button id="series-select-current" class="text-button">只选当前集</button>
        </div>
        <div id="series-episode-list" class="series-episode-list"></div>
        <div class="series-dialog-footer">
          <button id="series-skip" class="text-button">跳过此链接</button>
          <div class="series-dialog-actions">
            <button id="series-cancel" class="series-secondary">取消</button>
            <button id="series-confirm" class="series-primary">下载所选</button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <button id="return-to-rushb" hidden>返回 RushB（B站视频下载器）</button>
</body>
</html>
'''


BRIDGE_MAIN = r'''function bilidownReplyAccount(sender,channel){const request=r.net.request({method:"GET",url:"https://api.bilibili.com/x/web-interface/nav",session:r.session.defaultSession,useSessionCookies:!0});request.setHeader("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36");request.setHeader("Referer","https://www.bilibili.com");let body="";request.on("response",response=>{response.on("data",chunk=>body+=chunk.toString());response.on("end",()=>{try{const result=JSON.parse(body),data=result.data||{};sender.send(channel,{ok:0===result.code,isLogin:!!data.isLogin,uname:data.uname||"",mid:data.mid||"",vip:!!(data.vipStatus||data.vip_type),error:0===result.code?"":result.message||"账号状态读取失败"})}catch(error){sender.send(channel,{ok:!1,isLogin:!1,error:error.message})}})});request.on("error",error=>sender.send(channel,{ok:!1,isLogin:!1,error:error.message}));request.end()}const bilidownCookieNames=new Set(["SESSDATA","bili_jct","DedeUserID","DedeUserID__ckMd5","sid","buvid3","buvid4","buvid_fp","buvid_fp_plain","b_nut","CURRENT_FNVAL","CURRENT_QUALITY","CURRENT_PID","_uuid"]);r.ipcMain.on("getBiliAccount",event=>bilidownReplyAccount(event.sender,"biliAccountStatus")),r.ipcMain.on("importBiliCookies",async(event,cookies)=>{try{if(!Array.isArray(cookies)||cookies.length>80)throw new Error("浏览器返回的 Cookie 数据无效");const selected=cookies.filter(cookie=>cookie&&bilidownCookieNames.has(cookie.name)&&typeof cookie.value==="string"&&cookie.value&&/^\.?(?:[a-z0-9-]+\.)*bilibili\.com$/i.test(String(cookie.domain||"")));if(!selected.some(cookie=>cookie.name==="SESSDATA"))throw new Error("未找到 SESSDATA。请先在浏览器登录 B 站后重试");const session=r.session.defaultSession,existing=await session.cookies.get({});for(const cookie of existing){if(bilidownCookieNames.has(cookie.name)&&/(^|\.)bilibili\.com$/i.test(String(cookie.domain||""))){const domain=String(cookie.domain).replace(/^\./,"");await session.cookies.remove("https://"+domain+(cookie.path||"/"),cookie.name)}}for(const cookie of selected){const domain=String(cookie.domain).replace(/^\./,"");const options={url:"https://"+domain+(cookie.path||"/"),name:cookie.name,value:cookie.value,domain:cookie.domain,path:cookie.path||"/",secure:!!cookie.secure,httpOnly:!!cookie.httpOnly,sameSite:["no_restriction","lax","strict","unspecified"].includes(cookie.sameSite)?cookie.sameSite:"unspecified"};if(Number.isFinite(cookie.expirationDate))options.expirationDate=cookie.expirationDate;await session.cookies.set(options)}if(session.cookies.flushStore)await session.cookies.flushStore();bilidownReplyAccount({send:(channel,status)=>event.sender.send("biliCookiesImported",Object.assign({count:selected.length},status))},"biliCookiesImported")}catch(error){event.sender.send("biliCookiesImported",{ok:!1,isLogin:!1,error:error.message})}}),'''

BACKDROP_READY = r'''E.once("ready-to-show",()=>{const fs=require("fs"),d=c.dirname(process.execPath),l=c.join(d,"backdrop-startup.log"),g=m=>{try{fs.appendFileSync(l,new Date().toISOString()+" "+m+"\r\n")}catch(t){}};E.show(),E.focus();try{const h=E.getNativeWindowHandle().toString("hex"),s=c.join(d,"Set-RushBBackdrop.ps1"),p=c.join(process.env.SystemRoot||"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"),w=require("child_process").spawn(p,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",s,h],{windowsHide:!0,stdio:"ignore"});g("Electron="+(process.versions.electron||"unknown")+"; applying documented DWM Desktop Acrylic; HWND="+h);w.on("error",t=>g("DWM helper spawn error: "+t.message));w.on("close",t=>g("DWM helper exited: "+t))}catch(t){g("DWM helper launch exception: "+t.stack)}})'''


def find_entry(tree: dict, path: str) -> dict:
    node = tree
    parts = path.split("/")
    for part in parts[:-1]:
        node = node["files"][part]
    return node["files"][parts[-1]]


def add_or_replace_entry(tree: dict, path: str, size: int, offset: int) -> None:
    node = tree
    parts = path.split("/")
    for part in parts[:-1]:
        node = node.setdefault("files", {}).setdefault(part, {"files": {}})
    node.setdefault("files", {})[parts[-1]] = {"size": size, "offset": str(offset)}


def patch_asar() -> None:
    archive = ASAR.read_bytes()
    json_size = struct.unpack_from("<I", archive, 12)[0]
    tree = json.loads(archive[16 : 16 + json_size])
    body_start = (16 + json_size + 3) & ~3
    original_body = archive[body_start:]

    background = original_body[
        int(find_entry(tree, "background.js")["offset"])
        : int(find_entry(tree, "background.js")["offset"])
        + int(find_entry(tree, "background.js")["size"])
    ].decode("utf-8")
    lock_marker = 'd=n(148),m=r.app.requestSingleInstanceLock();'
    if lock_marker not in background:
        raise RuntimeError("Could not find the single-instance profile hook")
    background = background.replace(
        lock_marker,
        'd=n(148);r.app.setPath("userData",c.join(r.app.getPath("appData"),"bilidown"));const m=r.app.requestSingleInstanceLock();',
        1,
    )
    protocol_call = 'r.app.setAsDefaultProtocolClient("bilidown",process.execPath,t);'
    if protocol_call in background:
        background = background.replace(protocol_call, "void 0;", 1)
    background = background.replace('r.app.setName("Bilidown")', 'r.app.setName("RushB")', 1)
    background = background.replace('v.setToolTip("Bilidown")', 'v.setToolTip("RushB（B站视频下载器）")', 1)
    window_marker = 'center:!0,frame:!1,icon:c.join(__dirname,"logo.ico")'
    if window_marker not in background:
        raise RuntimeError("Could not find the RushB window options")
    background = background.replace(
        window_marker,
        'center:!0,frame:!1,transparent:!0,backgroundColor:"#00000000",icon:c.join(__dirname,"logo.ico")',
        1,
    )
    ready_marker = 'E.once("ready-to-show",()=>{E.show(),E.focus()})'
    if ready_marker not in background:
        raise RuntimeError("Could not find the RushB window ready handler")
    background = background.replace(
        ready_marker,
        BACKDROP_READY,
        1,
    )
    ipc_marker = 'r.ipcMain.on("clearCookie",'
    if ipc_marker not in background:
        raise RuntimeError("Could not find the RushB IPC insertion point")
    background = background.replace(ipc_marker, "void 0;" + BRIDGE_MAIN + ipc_marker, 1)

    appended = bytearray()

    def append_file(path: str, data: bytes) -> None:
        offset = len(original_body) + len(appended)
        add_or_replace_entry(tree, path, len(data), offset)
        appended.extend(data)

    append_file("index.html", INDEX_HTML.encode("utf-8"))
    append_file("background.js", background.encode("utf-8"))
    append_file("assets/js/rushb-ui.js", JS_SOURCE.read_bytes())
    append_file("assets/css/rushb-ui.css", CSS_SOURCE.read_bytes())

    header = json.dumps(tree, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    header_size = len(header)
    padded_header_size = (header_size + 3) & ~3
    inner_pickle_size = padded_header_size + 4
    outer_header_size = inner_pickle_size + 4
    pickle_header = struct.pack("<IIII", 4, outer_header_size, inner_pickle_size, header_size)
    header_padding = b"\0" * (padded_header_size - header_size)
    packed = pickle_header + header + header_padding + original_body + appended
    destination = OUTPUT / "resources" / "app.asar"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(packed)


def copy_runtime() -> None:
    if (OUTPUT / "RushB.exe").exists():
        return
    if OUTPUT.exists() and any(OUTPUT.iterdir()):
        raise FileExistsError(f"Output folder already contains files: {OUTPUT}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    skip = {
        "Bilidown Setup 1.2.7.exe",
        "Uninstall Bilidown.exe",
        "uninstallerIcon.ico",
    }
    for source_file in SOURCE.iterdir():
        if source_file.name in skip or source_file.name == "resources":
            continue
        target = OUTPUT / source_file.name
        if source_file.is_dir():
            shutil.copytree(source_file, target)
        else:
            shutil.copy2(source_file, target)
    shutil.copytree(SOURCE / "resources", OUTPUT / "resources")
    (OUTPUT / "Bilidown.exe").rename(OUTPUT / "RushB.exe")


def write_readme() -> None:
    readme = """# RushB（B站视频下载器）

RushB 提供批量链接下载、系列视频选择、最高可用音视频画质自动选择、账号登录管理，以及下载任务与记录管理。

## 使用

1. 双击 `启动RushB.bat`。RushB 与 Bilidown 共用登录状态和设置；切换前先从 RushB 托盘菜单选择“退出”，并关闭 Bilidown，避免旧进程接管启动请求。
2. 每行粘贴一个 B 站 BV 号、av 号或视频页链接。普通多 P 视频默认下载全部分 P；合集 / 系列会先弹出集数选择窗口，默认只勾选当前集，可多选或全选。带 `?p=` 的链接默认定位到指定集。
3. 点击“一键下载”，所选任务会交给内置 aria2 和 ffmpeg 处理；弹窗中的“跳过此链接”可略过当前系列链接。
4. 点击标题栏的小圆图标，可查看下载中、等待中、暂停任务的进度和速度、切换已下载记录、清理下载记录，并在面板顶部打开保存位置；清理记录不会删除本地视频文件。
5. 右上角“设置”可查看账号状态、设置保存目录与最高可用画质 / 音质，并选择浏览器导入或 B 站扫码登录。
6. 在“设置 → 软件声明”中查看项目来源、内容使用规范、登录数据处理方式和免责声明。

## 浏览器登录

首次导入时，在系统默认浏览器登录 B 站，打开 `edge://extensions/` 或 `chrome://extensions/`，开启“开发人员模式”并加载 `RushB浏览器登录桥接` 文件夹。然后回到 RushB 设置，点击“从浏览器获取登录状态”。扩展只读取 B 站域名下的登录相关 Cookie，通过本机随机一次性令牌传入 RushB。也可在设置里选择“自行登录”并扫码。

## 构建

需要本机已安装 Bilidown 1.2.7。设置环境变量 `BILIDOWN_DIR` 指向其安装目录，然后运行：

```powershell
python build_rushb.py
```

默认产物写入 `dist/`；可通过 `RUSHB_OUTPUT` 指定输出目录。构建过程会复制本机 Bilidown 运行时并替换界面资源。

## 来源说明

RushB 基于 B 站 UP 主 **@王子周棋洛** 的 Bilidown 魔改，原项目已停止维护，现由 **@Harry张** 进行优化更新。
原项目的公开源码状态及许可证范围尚未核实；本说明不代表原作者背书或对原项目代码授予额外许可。

## 源码

- `src/rushb_ui.js`、`src/rushb_ui.css`：RushB 界面与批量下载逻辑
- `browser-extension/`：Edge / Chrome 浏览器登录桥接扩展
- `launcher/`：Windows 启动器和调用 DWM Desktop Acrylic、标题栏颜色与窗口圆角的脚本
- `build_rushb.py`：从本机 Bilidown 安装构建 RushB

该源码仓库不包含 Bilidown 原始安装包或编译后的 Electron 运行时。
"""
    (OUTPUT / "使用说明.md").write_text(readme, encoding="utf-8")


def main() -> None:
    if SOURCE is None:
        raise SystemExit("Set BILIDOWN_DIR to the Bilidown 1.2.7 installation folder before building.")
    if not ASAR.is_file():
        raise SystemExit(f"Could not find Bilidown app.asar: {ASAR}")
    copy_runtime()
    patch_asar()
    write_readme()
    shutil.copy2(JS_SOURCE, OUTPUT / "rushb-ui.js")
    shutil.copy2(CSS_SOURCE, OUTPUT / "rushb-ui.css")
    shutil.copy2(LAUNCHER_SOURCE / "Start-RushB.bat", OUTPUT / "启动RushB.bat")
    shutil.copy2(LAUNCHER_SOURCE / "Start-RushB.ps1", OUTPUT / "启动RushB.ps1")
    shutil.copy2(BACKDROP_SOURCE, OUTPUT / "Set-RushBBackdrop.ps1")
    target_extension = OUTPUT / "RushB浏览器登录桥接"
    if target_extension.exists():
        shutil.rmtree(target_extension)
    shutil.copytree(EXTENSION_SOURCE, target_extension)
    print(OUTPUT)


if __name__ == "__main__":
    main()
