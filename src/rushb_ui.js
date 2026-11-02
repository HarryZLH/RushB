(() => {
  "use strict";

  const { remote, ipcRenderer } = window.require("electron");
  const http = window.require("http");
  const crypto = window.require("crypto");
  const path = window.require("path");
  const shell = document.getElementById("batch-shell");
  const input = document.getElementById("batch-links");
  const countLabel = document.getElementById("link-count");
  const statusLabel = document.getElementById("batch-status");
  const startButton = document.getElementById("start-download");
  const downloadStatusButton = document.getElementById("download-status-button");
  const downloadPanel = document.getElementById("download-panel");
  const downloadPanelOpenFolderButton = document.getElementById("download-panel-open-folder");
  const downloadPanelSummary = document.getElementById("download-panel-summary");
  const downloadActiveList = document.getElementById("download-active-list");
  const downloadCompletedList = document.getElementById("download-completed-list");
  const downloadActiveCount = document.getElementById("download-active-count");
  const downloadCompletedCount = document.getElementById("download-completed-count");
  const downloadTabActive = document.getElementById("download-tab-active");
  const downloadTabCompleted = document.getElementById("download-tab-completed");
  const downloadClearRecordsButton = document.getElementById("download-clear-records");
  const settingsView = document.getElementById("settings-view");
  const aboutButton = document.getElementById("about-button");
  const aboutDialog = document.getElementById("about-dialog");
  const aboutCloseButton = document.getElementById("about-close");
  const aboutAcknowledgeButton = document.getElementById("about-acknowledge");
  const returnToLiteButton = document.getElementById("return-to-rushb");
  const accountStatus = document.getElementById("account-status");
  const accountIdentity = document.getElementById("account-identity");
  const browserStatus = document.getElementById("browser-import-status");
  const seriesPicker = document.getElementById("series-picker");
  const seriesList = document.getElementById("series-episode-list");
  const seriesSelectedCount = document.getElementById("series-selected-count");
  const seriesTotalCount = document.getElementById("series-total-count");
  const seriesToggleAll = document.getElementById("series-toggle-all");
  const seriesSelectCurrent = document.getElementById("series-select-current");
  const seriesConfirm = document.getElementById("series-confirm");
  let seriesSelectionResolver = null;
  const windowControls = remote.getCurrentWindow();
  let busy = false;
  let currentDownloadVm = null;
  let downloadStatusTimer = null;
  let sawDownloadWork = false;
  let downloadPanelTab = "active";
  let downloadPanelOpen = false;
  let downloadStatusMessage = "空闲";
  let downloadedRecords = [];
  let downloadedRecordsError = "";
  let downloadedRecordsLoading = false;
  let downloadedRecordsClearing = false;
  let browserServer = null;
  let browserToken = "";
  let browserImportStarted = false;
  let savePath = localStorage.getItem("defaultDownPath") || remote.app.getPath("desktop");
  const extensionPath = path.join(path.dirname(remote.app.getPath("exe")), "RushB浏览器登录桥接");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function showStatus(message, kind = "normal") {
    statusLabel.textContent = message;
    statusLabel.dataset.kind = kind;
  }

  function updateDownloadButtonLabel() {
    const action = downloadPanelOpen ? "再次点击关闭下载任务面板" : "点击打开下载任务面板";
    downloadStatusButton.title = `下载状态：${downloadStatusMessage}；${action}`;
    downloadStatusButton.setAttribute("aria-label", `下载状态：${downloadStatusMessage}；${action}`);
  }

  function setDownloadStatus(state, message) {
    downloadStatusButton.dataset.state = state;
    downloadStatusMessage = message;
    updateDownloadButtonLabel();
  }

  function refreshDownloadStatus() {
    if (busy) {
      setDownloadStatus("processing", "正在解析或启动任务");
      if (!downloadPanel.hidden) renderActiveDownloadTasks();
      return;
    }

    const liveDownloadVm = downloadViewModel();
    if (liveDownloadVm) currentDownloadVm = liveDownloadVm;
    const model = currentDownloadVm;
    if (!model) {
      setDownloadStatus("idle", "空闲");
      if (!downloadPanel.hidden) renderActiveDownloadTasks();
      return;
    }

    const downloading = Array.isArray(model.downloading) ? model.downloading : [];
    const pending = Array.isArray(model.download) ? model.download : [];
    const activeCount = downloading.filter((task) => task.isDownloading && !task.paused && task.status !== "paused").length;
    const pausedCount = downloading.filter((task) => task.paused || task.status === "paused").length;
    const failedCount = pending.filter((task) => task.tip || task.status === "error").length;
    const totalCount = downloading.length + pending.length;

    if (totalCount > 0) sawDownloadWork = true;
    if (activeCount > 0) {
      const waitingCount = Math.max(0, totalCount - activeCount);
      setDownloadStatus("active", waitingCount ? `下载中 ${activeCount} 项，另有 ${waitingCount} 项等待` : `下载中 ${activeCount} 项`);
    } else if (pausedCount > 0) {
      setDownloadStatus("paused", `已暂停 ${pausedCount} 项`);
    } else if (totalCount > 0) {
      setDownloadStatus(failedCount ? "error" : "queued", failedCount ? `${failedCount} 项异常待处理` : `队列中 ${totalCount} 项`);
    } else if (statusLabel.dataset.kind === "error") {
      setDownloadStatus("error", "任务启动失败");
    } else if (sawDownloadWork) {
      setDownloadStatus("complete", "任务已完成");
    } else {
      setDownloadStatus("idle", "空闲");
    }
    if (!downloadPanel.hidden) renderActiveDownloadTasks();
  }

  function activeDownloadTasks() {
    const model = downloadViewModel() || currentDownloadVm;
    if (!model) return [];
    const tasks = [...(Array.isArray(model.downloading) ? model.downloading : []), ...(Array.isArray(model.download) ? model.download : [])];
    const seen = new Set();
    return tasks.filter((task) => {
      const key = String(task.gid || (task.bv && task.cid ? `${task.bv}:${task.cid}` : task.cid || task.title || ""));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((left, right) => Number(Boolean(right.isDownloading)) - Number(Boolean(left.isDownloading)));
  }

  function taskState(task) {
    if (task.tip || task.status === "error" || task.status === "failed") return { label: "异常", kind: "error" };
    if (task.paused || task.status === "paused") return { label: "已暂停", kind: "paused" };
    if (task.isDownloading || task.status === "downloading" || task.status === "active") return { label: "下载中", kind: "active" };
    return { label: "等待中", kind: "queued" };
  }

  function taskProgress(task) {
    const total = Number(task.totalLength || 0);
    const completed = Number(task.completedLength || 0);
    if (total > 0) return Math.max(0, Math.min(100, Math.round(completed / total * 100)));
    const value = Number.parseFloat(String(task.progress || "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value <= 1 && !String(task.progress).includes("%") ? value * 100 : value));
  }

  function createDownloadRow(title, subtitle, state, progress, errorText = "", actionButton = null) {
    const row = document.createElement("article");
    row.className = "download-row";
    const heading = document.createElement("div");
    heading.className = "download-row-heading";
    const titleNode = document.createElement("strong");
    titleNode.className = "download-row-title";
    titleNode.textContent = title || "B 站视频";
    const stateNode = document.createElement("span");
    stateNode.className = `download-row-state is-${state.kind}`;
    stateNode.textContent = state.label;
    const trailing = document.createElement("div");
    trailing.className = "download-row-trailing";
    trailing.append(stateNode);
    if (actionButton) trailing.append(actionButton);
    heading.append(titleNode, trailing);
    row.append(heading);

    if (subtitle) {
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "download-row-subtitle";
      subtitleNode.textContent = subtitle;
      row.append(subtitleNode);
    }

    if (progress) {
      const progressTrack = document.createElement("div");
      progressTrack.className = "download-progress-track";
      const progressFill = document.createElement("span");
      progressFill.style.width = `${progress.value}%`;
      progressTrack.append(progressFill);
      row.append(progressTrack);
      const progressInfo = document.createElement("div");
      progressInfo.className = "download-progress-info";
      const sizeText = document.createElement("span");
      sizeText.textContent = progress.size || `${progress.value}%`;
      progressInfo.append(sizeText);
      if (progress.speed) {
        const speedText = document.createElement("span");
        speedText.textContent = progress.speed;
        progressInfo.append(speedText);
      }
      row.append(progressInfo);
    }

    if (errorText) {
      const error = document.createElement("p");
      error.className = "download-row-error";
      error.textContent = errorText;
      row.append(error);
    }
    return row;
  }

  function renderEmptyList(list, message) {
    const empty = document.createElement("div");
    empty.className = "download-list-empty";
    empty.textContent = message;
    list.replaceChildren(empty);
  }

  function renderActiveDownloadTasks() {
    const tasks = activeDownloadTasks();
    const downloading = tasks.filter((task) => task.isDownloading && !task.paused && task.status !== "paused").length;
    const waiting = tasks.filter((task) => !task.isDownloading && !task.paused && task.status !== "paused").length;
    const paused = tasks.filter((task) => task.paused || task.status === "paused").length;
    downloadActiveCount.textContent = String(tasks.length);
    downloadPanelSummary.textContent = tasks.length
      ? [`下载中 ${downloading}`, `等待 ${waiting}`, paused ? `暂停 ${paused}` : ""].filter(Boolean).join(" · ")
      : busy ? "正在解析视频链接…" : "当前没有进行中的任务";
    if (!tasks.length) {
      renderEmptyList(downloadActiveList, busy ? "解析完成后会在这里显示下载进度。" : "开始下载后，进度和速度会显示在这里。被暂停或等待中的任务也会列出。");
      return;
    }
    const fragment = document.createDocumentFragment();
    tasks.forEach((task) => {
      const state = taskState(task);
      const size = String(task.progressMB || "").replace(/^--\/--$/, "");
      const speed = String(task.speed || "").replace(/^0\s*(?:B|bytes)?\/s$/i, "");
      fragment.append(createDownloadRow(
        task.title || task.fenpTitle || task.hejiTitle || task.bv,
        [task.upname, task.fenpTitle && task.title !== task.fenpTitle ? task.fenpTitle : ""].filter(Boolean).join(" · "),
        state,
        { value: taskProgress(task), size: size || (state.kind === "queued" ? "等待下载" : "准备中"), speed },
        task.tip || ""
      ));
    });
    downloadActiveList.replaceChildren(fragment);
  }

  async function readDownloadedRecords() {
    if (typeof indexedDB.databases !== "function") throw new Error("当前运行环境不支持读取下载记录");
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === "downloadDatabase")) return [];
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("downloadDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("打开下载记录失败"));
    });
    if (!database.objectStoreNames.contains("downloaded")) {
      database.close();
      return [];
    }
    return new Promise((resolve, reject) => {
      const request = database.transaction("downloaded", "readonly").objectStore("downloaded").getAll();
      request.onsuccess = () => {
        const timestamp = (value) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric) && numeric > 100000000000) return numeric;
          const parsed = Date.parse(value || "");
          return Number.isFinite(parsed) ? parsed : (numeric || 0);
        };
        const records = request.result || [];
        database.close();
        resolve(records.sort((left, right) => timestamp(right.downDate) - timestamp(left.downDate) || Number(right.id || 0) - Number(left.id || 0)));
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error("读取下载记录失败"));
      };
    });
  }

  async function refreshDownloadedRecords() {
    if (downloadedRecordsLoading) return;
    downloadedRecordsLoading = true;
    downloadedRecordsError = "";
    renderDownloadedRecords();
    try {
      downloadedRecords = await readDownloadedRecords();
    } catch (error) {
      downloadedRecordsError = error?.message || "读取下载记录失败。";
    } finally {
      downloadedRecordsLoading = false;
      renderDownloadedRecords();
    }
  }

  async function clearDownloadedRecords() {
    if (downloadedRecordsLoading || downloadedRecordsClearing || downloadedRecordsError || !downloadedRecords.length) return;
    downloadedRecordsClearing = true;
    renderDownloadedRecords();
    let database;
    try {
      database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("downloadDatabase");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("打开下载记录失败"));
      });
      if (!database.objectStoreNames.contains("downloaded")) {
        downloadedRecords = [];
        downloadedRecordsError = "";
        return;
      }
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("downloaded", "readwrite");
        const request = transaction.objectStore("downloaded").clear();
        request.onerror = () => reject(request.error || new Error("清理下载记录失败"));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("清理下载记录失败"));
        transaction.onabort = () => reject(transaction.error || new Error("清理下载记录已取消"));
      });
      downloadedRecords = [];
      downloadedRecordsError = "";
    } catch (error) {
      downloadedRecordsError = error?.message || "清理下载记录失败。";
    } finally {
      database?.close();
      downloadedRecordsClearing = false;
      renderDownloadedRecords();
    }
  }

  function renderDownloadedRecords() {
    downloadCompletedCount.textContent = String(downloadedRecords.length);
    downloadClearRecordsButton.disabled = downloadedRecordsLoading || downloadedRecordsClearing || Boolean(downloadedRecordsError) || !downloadedRecords.length;
    if (downloadedRecordsLoading) return renderEmptyList(downloadCompletedList, "正在读取已下载记录…");
    if (downloadedRecordsError) return renderEmptyList(downloadCompletedList, downloadedRecordsError);
    if (!downloadedRecords.length) return renderEmptyList(downloadCompletedList, "暂无下载记录；清理记录不会删除本地视频文件。");
    const fragment = document.createDocumentFragment();
    downloadedRecords.forEach((record) => {
      let dateValue = Number(record.downDate || 0);
      if (dateValue > 0 && dateValue < 100000000000) dateValue *= 1000;
      const date = record.downDate ? new Date(Number.isFinite(dateValue) && dateValue > 0 ? dateValue : record.downDate) : null;
      const dateText = date && Number.isFinite(date.getTime()) ? date.toLocaleString() : String(record.downDate || "已完成");
      const folderButton = document.createElement("button");
      folderButton.type = "button";
      folderButton.className = "download-row-folder";
      folderButton.setAttribute("aria-label", `打开视频所在文件夹：${record.title || record.bv || "B 站视频"}`);
      folderButton.title = "打开视频所在文件夹";
      folderButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M2.5 5.4c0-.8.65-1.45 1.45-1.45h3.6l1.45 1.6h6.55c.8 0 1.45.65 1.45 1.45v.8H2.5V5.4Zm0 3.55h14.5l-1.55 6.15H4.05L2.5 8.95Z"/><path d="M11.9 3.35h4v4m0-4-4.65 4.65"/></svg>';
      folderButton.addEventListener("click", async () => {
        const folder = String(record.path || "").trim();
        if (!folder) {
          downloadPanelSummary.textContent = "这条下载记录没有保存文件夹路径。";
          return;
        }
        try {
          const error = await remote.shell.openPath(folder);
          if (error) throw new Error(error);
          downloadPanelSummary.textContent = "已打开视频所在文件夹。";
        } catch (error) {
          const message = error?.message || "无法打开文件夹。";
          folderButton.title = `打开失败：${message}`;
          downloadPanelSummary.textContent = `无法打开视频所在文件夹：${message}`;
        }
      });
      fragment.append(createDownloadRow(
        record.title || record.bv || "B 站视频",
        [record.upname, record.type, dateText].filter(Boolean).join(" · "),
        { label: "已下载", kind: "complete" },
        null,
        "",
        folderButton
      ));
    });
    downloadCompletedList.replaceChildren(fragment);
  }

  function selectDownloadPanelTab(tab) {
    downloadPanelTab = tab;
    const completed = tab === "completed";
    downloadTabActive.classList.toggle("is-selected", !completed);
    downloadTabCompleted.classList.toggle("is-selected", completed);
    downloadTabActive.setAttribute("aria-selected", String(!completed));
    downloadTabCompleted.setAttribute("aria-selected", String(completed));
    downloadActiveList.hidden = completed;
    downloadCompletedList.hidden = !completed;
    downloadClearRecordsButton.hidden = !completed;
    if (completed) refreshDownloadedRecords();
    else renderActiveDownloadTasks();
  }

  function setDownloadPanelOpen(open) {
    downloadPanelOpen = Boolean(open);
    downloadPanel.hidden = !downloadPanelOpen;
    downloadStatusButton.setAttribute("aria-expanded", String(downloadPanelOpen));
    updateDownloadButtonLabel();
    if (downloadPanelOpen) {
      if (downloadPanelTab === "completed") refreshDownloadedRecords();
      else renderActiveDownloadTasks();
    }
  }

  function startDownloadStatusMonitor() {
    if (downloadStatusTimer) return;
    refreshDownloadStatus();
    downloadStatusTimer = setInterval(refreshDownloadStatus, 900);
  }

  function updatePathLabel() {
    const settingsPath = document.getElementById("settings-save-path");
    settingsPath.textContent = savePath;
    settingsPath.title = savePath;
  }

  function setAccountStatus(result) {
    if (!result?.ok) {
      accountStatus.textContent = "未能读取";
      accountStatus.dataset.kind = "warning";
      accountIdentity.textContent = result?.error || "请检查网络连接后重试。";
      return;
    }
    if (result.isLogin) {
      accountStatus.textContent = "已登录";
      accountStatus.dataset.kind = "success";
      const badges = [result.uname || "B 站账号", result.mid ? `UID ${result.mid}` : "", result.vip ? "大会员" : "普通账号"];
      accountIdentity.textContent = badges.filter(Boolean).join(" · ");
    } else {
      accountStatus.textContent = "未登录";
      accountStatus.dataset.kind = "warning";
      accountIdentity.textContent = "当前 RushB 没有可用的 B 站登录状态。";
    }
  }

  function refreshAccountStatus() {
    accountStatus.textContent = "正在检查";
    accountStatus.dataset.kind = "normal";
    accountIdentity.textContent = "正在读取当前 RushB 账号…";
    let timer;
    const onStatus = (_event, result) => {
      clearTimeout(timer);
      setAccountStatus(result);
    };
    ipcRenderer.once("biliAccountStatus", onStatus);
    timer = setTimeout(() => {
      ipcRenderer.removeListener("biliAccountStatus", onStatus);
      setAccountStatus({ ok: false, error: "读取账号状态超时，请检查网络后重试。" });
    }, 15000);
    ipcRenderer.send("getBiliAccount");
  }

  function setLoginMethod(method) {
    localStorage.setItem("loginMethod", method);
    document.querySelectorAll('input[name="login-method"]').forEach((radio) => {
      radio.checked = radio.value === method;
    });
    document.getElementById("browser-method").hidden = method !== "browser";
    document.getElementById("manual-method").hidden = method !== "manual";
  }

  function showSettings() {
    document.querySelector(".workbench").hidden = true;
    settingsView.hidden = false;
    updatePathLabel();
    refreshAccountStatus();
  }

  function showHome() {
    settingsView.hidden = true;
    document.querySelector(".workbench").hidden = false;
  }

  function openAboutDialog() {
    aboutDialog.hidden = false;
    aboutButton.setAttribute("aria-expanded", "true");
    aboutCloseButton.focus();
  }

  function closeAboutDialog() {
    aboutDialog.hidden = true;
    aboutButton.setAttribute("aria-expanded", "false");
    aboutButton.focus();
  }

  function stopBrowserImport(message = "") {
    if (browserServer) {
      browserServer.close();
      browserServer = null;
    }
    browserToken = "";
    browserImportStarted = false;
    if (message) browserStatus.textContent = message;
  }

  function isLoopback(address = "") {
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  }

  function startBrowserImport() {
    if (browserServer) stopBrowserImport();
    browserStatus.textContent = "正在启动本地连接…";
    browserImportStarted = false;
    browserToken = crypto.randomBytes(32).toString("hex");

    browserServer = http.createServer((request, response) => {
      const localUrl = new URL(request.url, "http://127.0.0.1");
      if (!isLoopback(request.socket.remoteAddress)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, X-RushB-Token",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "600",
        }).end();
        return;
      }
      if (request.method === "GET" && localUrl.pathname === "/import" && localUrl.searchParams.get("token") === browserToken) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>RushB（B站视频下载器）账号导入</title><style>body{margin:0;background:#17191d;color:#e7e9ed;font:15px 'Segoe UI','Microsoft YaHei',sans-serif;display:grid;place-items:center;min-height:100vh}.box{max-width:460px;padding:28px;background:#202329;border:1px solid #373c45;border-radius:12px}h2{margin:0 0 12px}p{color:#a8b0ba;line-height:1.7}</style><main class=box><h2>正在连接 RushB（B站视频下载器）</h2><p id=bridge-status>请保持此页打开。浏览器扩展正在读取当前 B 站登录状态…</p></main>");
        return;
      }
      if (request.method !== "POST" || localUrl.pathname !== "/cookies" || request.headers["x-rushb-token"] !== browserToken || browserImportStarted) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      browserImportStarted = true;
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString("utf8");
        if (body.length > 256 * 1024) request.destroy();
      });
      request.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const cookies = Array.isArray(payload.cookies) ? payload.cookies : [];
          if (cookies.length > 80) throw new Error("浏览器返回的 B 站 Cookie 数量异常");
          response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ accepted: true }));
          stopBrowserImport();
          browserStatus.textContent = "已收到浏览器登录状态，正在验证…";
          ipcRenderer.once("biliCookiesImported", (_event, result) => {
            if (result?.ok && result.isLogin) {
              browserStatus.textContent = `导入成功：${result.uname || "B 站账号"}，${result.count} 项 Cookie 已验证。`;
              setAccountStatus(result);
            } else {
              browserStatus.textContent = result?.error || "Cookie 已接收，但账号未通过 B 站验证。";
              setAccountStatus(result);
            }
          });
          ipcRenderer.send("importBiliCookies", cookies);
        } catch (error) {
          response.writeHead(400).end(error.message || "Invalid payload");
          stopBrowserImport(error.message || "导入数据无效。请重试。");
        }
      });
    });

    browserServer.on("error", (error) => stopBrowserImport(`本地连接启动失败：${error.message}`));
    browserServer.listen(0, "127.0.0.1", () => {
      const address = browserServer.address();
      const pageUrl = `http://127.0.0.1:${address.port}/import?token=${browserToken}`;
      browserStatus.textContent = "已打开浏览器，请在该页面等待导入完成…";
      remote.shell.openExternal(pageUrl);
      setTimeout(() => {
        if (browserServer) stopBrowserImport("等待超时。请确认扩展已加载且浏览器已登录 B 站，然后重试。");
      }, 90000);
    });
  }

  async function openManualLogin() {
    await openRoute("/acount");
    shell.classList.remove("is-ready");
    document.body.classList.add("account-mode");
    returnToLiteButton.hidden = false;
  }

  async function returnFromManualLogin() {
    document.body.classList.remove("account-mode");
    returnToLiteButton.hidden = true;
    shell.classList.add("is-ready");
    await openRoute("/search");
    showSettings();
  }

  function readLinks() {
    const values = input.value
      .split(/[\r\n,，;；\t ]+/)
      .map((value) => value.trim().replace(/[),，。；;]+$/g, ""))
      .filter(Boolean);
    const unique = new Map();
    for (const value of values) {
      const key = value.toLowerCase();
      if (!unique.has(key)) unique.set(key, value);
    }
    return [...unique.values()];
  }

  function isBilibiliLink(value) {
    return /^(bv[\da-z]{10}|av\d+)$/i.test(value) ||
      /^https?:\/\/(?:www\.)?bilibili\.com\//i.test(value) ||
      /^https?:\/\/(?:www\.)?b23\.tv\//i.test(value);
  }

  function collectViewModels(root) {
    const result = [];
    const seen = new Set();
    const visit = (vm) => {
      if (!vm || seen.has(vm)) return;
      seen.add(vm);
      result.push(vm);
      for (const child of vm.$children || []) visit(child);
    };
    visit(root);
    return result;
  }

  function appRoot() {
    return document.getElementById("app")?.__vue__ || null;
  }

  function searchViewModel() {
    return collectViewModels(appRoot()).find((vm) =>
      typeof vm.search === "function" &&
      typeof vm.getVideoDetail === "function" &&
      typeof vm.parseBv === "function"
    );
  }

  function downloadViewModel() {
    return collectViewModels(appRoot()).find((vm) =>
      typeof vm.addDownTask === "function" &&
      typeof vm.connectAria2 === "function" &&
      Array.isArray(vm.downloading)
    );
  }

  async function waitFor(getValue, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = getValue();
      if (value) return value;
      await sleep(100);
    }
    throw new Error("RushB 页面尚未准备好，请稍后再试。");
  }

  async function openRoute(path) {
    const root = await waitFor(appRoot);
    try {
      await root.$router.push(path);
    } catch (_) {
      // Vue Router reports a duplicate-navigation error when the route is already active.
    }
    await sleep(120);
  }

  function chooseHighestQuality(searchVm) {
    searchVm.selectDefaultQnBySystem = function (videoMap, audioMap) {
      const videoRank = { 127: 0, 126: 1, 125: 2, 120: 3, 116: 4, 112: 5, 80: 6, 74: 7, 64: 8, 32: 9, 16: 10, 6: 11 };
      const codecRank = { av01: 0, hev1: 1, avc1: 2 };
      const videos = (videoMap || []).map((item, index) => ({ item, index }));
      videos.sort((left, right) => {
        const leftCode = String(left.item.qnCode);
        const rightCode = String(right.item.qnCode);
        const leftRank = videoRank[leftCode] ?? (100 - Number(leftCode || 0) / 1000);
        const rightRank = videoRank[rightCode] ?? (100 - Number(rightCode || 0) / 1000);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return (codecRank[left.item.codecs] ?? 9) - (codecRank[right.item.codecs] ?? 9);
      });

      const audioRank = (item) => {
        const description = String(item.qnDesc || "").toLowerCase();
        if (/hi.?res|flac|无损/.test(description)) return 0;
        if (/dolby|杜比/.test(description)) return 1;
        const ranks = { 30251: 0, 30250: 1, 30280: 2, 30232: 3, 30216: 4 };
        return ranks[String(item.qnCode)] ?? (20 - Number(item.qnCode || 0) / 100000);
      };
      const audios = (audioMap || []).map((item, index) => ({ item, index }));
      audios.sort((left, right) => audioRank(left.item) - audioRank(right.item));

      const bestVideo = videos[0];
      const bestAudio = audios[0];
      return {
        video: bestVideo ? { videoDesc: bestVideo.item.qnDesc, videoIndex: bestVideo.index } : { videoDesc: "", videoIndex: -1 },
        audio: bestAudio ? { audioDesc: bestAudio.item.qnDesc, audioIndex: bestAudio.index } : { audioDesc: "", audioIndex: -1 },
      };
    };
  }

  function episodePage(episode, index) {
    return index + 1;
  }

  function updateSeriesSelectionCount() {
    const selectedCount = seriesList.querySelectorAll('input[type="checkbox"]:checked').length;
    seriesSelectedCount.textContent = String(selectedCount);
    seriesConfirm.disabled = selectedCount === 0;
    seriesToggleAll.textContent = selectedCount === Number(seriesTotalCount.textContent) ? "取消全选" : "全选";
  }

  function closeSeriesPicker(selection) {
    if (!seriesSelectionResolver) return;
    const resolve = seriesSelectionResolver;
    seriesSelectionResolver = null;
    seriesPicker.hidden = true;
    resolve(selection);
  }

  function chooseSeriesEpisodes(searchVm) {
    const media = searchVm.mediaData || {};
    const rawEpisodes = Array.isArray(media.heji) && media.heji.length
      ? media.heji
      : (Array.isArray(searchVm.selectPages) ? searchVm.selectPages : []);
    const episodes = rawEpisodes.map((episode, index) => ({ episode, page: episodePage(episode, index), index }));
    if (!episodes.length) return Promise.resolve({ pages: [] });

    const availablePages = new Set(episodes.map((item) => item.page));
    const parsedPage = Number(searchVm.p || 0);
    const previouslySelected = Array.isArray(searchVm.selectedP)
      ? searchVm.selectedP.map(Number).filter((page) => availablePages.has(page))
      : [];
    const currentPage = availablePages.has(parsedPage)
      ? parsedPage
      : (previouslySelected[0] || episodes[0].page);
    const mediaTitle = media.title || searchVm.videoTitle || "当前视频";
    const seriesTitle = media.hejiTitle || "合集 / 系列";
    document.getElementById("series-picker-subtitle").textContent = `${seriesTitle} · ${mediaTitle}`;
    seriesList.replaceChildren();
    seriesTotalCount.textContent = String(episodes.length);

    for (const item of episodes) {
      const label = document.createElement("label");
      label.className = "series-episode";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(item.page);
      checkbox.checked = item.page === currentPage;
      checkbox.dataset.current = String(item.page === currentPage);
      checkbox.addEventListener("change", updateSeriesSelectionCount);
      const number = document.createElement("span");
      number.className = "series-episode-number";
      number.textContent = `第 ${item.page} 集`;
      const title = document.createElement("span");
      title.className = "series-episode-title";
      title.textContent = item.episode?.long_title || item.episode?.title || item.episode?.part || `视频 ${item.index + 1}`;
      label.append(checkbox, number, title);
      seriesList.append(label);
    }

    updateSeriesSelectionCount();
    seriesPicker.hidden = false;
    seriesConfirm.focus();
    return new Promise((resolve) => {
      seriesSelectionResolver = resolve;
    });
  }

  async function parseLink(link, tasks) {
    await openRoute("/search");
    const searchVm = await waitFor(searchViewModel);
    chooseHighestQuality(searchVm);

    const previousCommit = searchVm.commitWaitDownArr;
    searchVm.commitWaitDownArr = async function () {
      for (const task of this.waitDown || []) tasks.push(task);
      this.waitDown = [];
      this.pagesReqState = "pending";
    };

    try {
      searchVm.nativeLink = link;
      await searchVm.$nextTick();
      await searchVm.search(true);
      if (searchVm.selectPages?.length) {
        const isSeries = Array.isArray(searchVm.mediaData?.heji) && searchVm.mediaData.heji.length > 0;
        if (isSeries) {
          const choice = await chooseSeriesEpisodes(searchVm);
          if (!choice.pages?.length) return { skipped: true };
          searchVm.selectedP = choice.pages;
        } else {
          const specificPage = Number(searchVm.p || 0);
          if (specificPage > 0 && searchVm.selectPages.some((page) => Number(page.page) === specificPage)) {
            searchVm.selectedP = [specificPage];
          } else {
            searchVm.selectedP = searchVm.selectPages.map((page) => Number(page.page));
          }
        }
        await searchVm.getPagesDetails();
      }
      if (searchVm.waitDown?.length) await searchVm.commitWaitDownArr();
    } finally {
      if (typeof previousCommit === "function") searchVm.commitWaitDownArr = previousCommit;
    }
  }

  async function startBatch() {
    if (busy) return;
    const links = readLinks();
    if (!links.length) {
      showStatus("先粘贴一个或多个 B 站视频链接。", "error");
      input.focus();
      return;
    }
    const invalid = links.filter((link) => !isBilibiliLink(link));
    if (invalid.length) {
      showStatus(`有 ${invalid.length} 行不是 B 站视频链接，请检查后再开始。`, "error");
      input.focus();
      return;
    }

    busy = true;
    refreshDownloadStatus();
    startButton.disabled = true;
    startButton.classList.add("is-busy");
    const tasks = [];
    const failed = [];
    const skipped = [];
    const taskKeys = new Set();

    try {
      for (let index = 0; index < links.length; index += 1) {
        showStatus(`正在解析第 ${index + 1} / ${links.length} 条链接…`);
        const before = tasks.length;
        try {
          const result = await parseLink(links[index], tasks);
          if (result?.skipped) {
            skipped.push(links[index]);
            continue;
          }
        } catch (error) {
          failed.push(links[index]);
        }
        if (tasks.length === before && !failed.includes(links[index])) failed.push(links[index]);
        await sleep(100);
      }

      const uniqueTasks = tasks.filter((task) => {
        const key = `${task.bv || ""}:${task.cid || ""}`;
        if (taskKeys.has(key)) return false;
        taskKeys.add(key);
        return Boolean(task.bv && task.cid);
      });

      if (!uniqueTasks.length) {
        if (failed.length || skipped.length) {
          const parts = [];
          if (skipped.length) parts.push(`已跳过 ${skipped.length} 条系列链接`);
          if (failed.length) parts.push(`${new Set(failed).size} 条链接解析失败`);
          showStatus(parts.join("；"), failed.length ? "warning" : "success");
        } else {
          showStatus("没有解析到可下载内容，请检查链接或账号状态。", "error");
        }
        return;
      }

      showStatus(`正在启动下载引擎…已解析 ${uniqueTasks.length} 个视频`);
      await openRoute("/download");
      const downloadVm = await waitFor(downloadViewModel);
      if (!downloadVm.aria2) await downloadVm.connectAria2();
      await waitFor(() => downloadVm.aria2, 12000);
      const engineReady = await downloadVm.checkAvailableAria2(downloadVm);
      if (!engineReady) throw new Error("下载引擎未能启动。");

      downloadVm.downDirectory = savePath;
      downloadVm.download.push(...uniqueTasks);
      for (const task of uniqueTasks) await downloadVm.addDownTask(task);

      const failedCount = new Set(failed).size;
      const skippedCount = skipped.length;
      const details = [];
      if (failedCount) details.push(`${failedCount} 条链接未解析`);
      if (skippedCount) details.push(`已跳过 ${skippedCount} 条系列链接`);
      showStatus(
        details.length
          ? `已开始下载 ${uniqueTasks.length} 个视频；${details.join("；")}。`
          : `已开始下载 ${uniqueTasks.length} 个视频。`,
        failedCount ? "warning" : "success"
      );
    } catch (error) {
      showStatus(error?.message || "启动下载失败，请重试。", "error");
    } finally {
      busy = false;
      startButton.disabled = false;
      startButton.classList.remove("is-busy");
    }
  }

  function updateCount() {
    const count = readLinks().length;
    countLabel.textContent = `${count} 个链接`;
  }

  async function chooseSavePath() {
    const result = await remote.dialog.showOpenDialog(windowControls, {
      title: "选择保存位置",
      defaultPath: savePath,
      properties: ["openDirectory", "createDirectory"],
    });
    if (!result.canceled && result.filePaths?.[0]) {
      savePath = result.filePaths[0];
      localStorage.setItem("defaultDownPath", savePath);
      updatePathLabel();
      const downloadVm = downloadViewModel();
      if (downloadVm) downloadVm.downDirectory = savePath;
    }
  }

  document.getElementById("settings-choose-folder").addEventListener("click", chooseSavePath);
  document.getElementById("settings-button").addEventListener("click", showSettings);
  document.getElementById("back-to-home").addEventListener("click", showHome);
  aboutButton.addEventListener("click", openAboutDialog);
  aboutCloseButton.addEventListener("click", closeAboutDialog);
  aboutAcknowledgeButton.addEventListener("click", closeAboutDialog);
  aboutDialog.addEventListener("click", (event) => {
    if (event.target === aboutDialog) closeAboutDialog();
  });
  document.getElementById("open-manual-login").addEventListener("click", openManualLogin);
  returnToLiteButton.addEventListener("click", returnFromManualLogin);
  document.getElementById("open-extension-folder").addEventListener("click", () => remote.shell.openPath(extensionPath));
  document.getElementById("browser-import").addEventListener("click", startBrowserImport);
  downloadStatusButton.addEventListener("click", () => setDownloadPanelOpen(!downloadPanelOpen));
  document.getElementById("download-panel-close").addEventListener("click", () => setDownloadPanelOpen(false));
  downloadTabActive.addEventListener("click", () => selectDownloadPanelTab("active"));
  downloadTabCompleted.addEventListener("click", () => selectDownloadPanelTab("completed"));
  downloadClearRecordsButton.addEventListener("click", clearDownloadedRecords);
  seriesToggleAll.addEventListener("click", () => {
    const checkboxes = [...seriesList.querySelectorAll('input[type="checkbox"]')];
    const select = checkboxes.some((checkbox) => !checkbox.checked);
    checkboxes.forEach((checkbox) => { checkbox.checked = select; });
    updateSeriesSelectionCount();
  });
  seriesSelectCurrent.addEventListener("click", () => {
    const checkboxes = [...seriesList.querySelectorAll('input[type="checkbox"]')];
    checkboxes.forEach((checkbox) => { checkbox.checked = checkbox.dataset.current === "true"; });
    updateSeriesSelectionCount();
  });
  seriesConfirm.addEventListener("click", () => {
    const pages = [...seriesList.querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) => Number(checkbox.value));
    closeSeriesPicker({ pages });
  });
  document.getElementById("series-skip").addEventListener("click", () => closeSeriesPicker({ pages: [] }));
  document.getElementById("series-cancel").addEventListener("click", () => closeSeriesPicker({ pages: [] }));
  seriesPicker.addEventListener("click", (event) => {
    if (event.target === seriesPicker) closeSeriesPicker({ pages: [] });
  });
  document.addEventListener("keydown", (event) => {
    if (!aboutDialog.hidden) {
      if (event.key === "Escape") {
        closeAboutDialog();
      } else if (event.key === "Tab") {
        const focusable = [...aboutDialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !aboutDialog.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !aboutDialog.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (!seriesPicker.hidden && event.key === "Escape") closeSeriesPicker({ pages: [] });
    else if (downloadPanelOpen && event.key === "Escape") setDownloadPanelOpen(false);
  });
  document.querySelectorAll('input[name="login-method"]').forEach((radio) => {
    radio.addEventListener("change", () => setLoginMethod(radio.value));
  });

  downloadPanelOpenFolderButton.addEventListener("click", () => remote.shell.openPath(savePath));
  startButton.addEventListener("click", startBatch);
  input.addEventListener("input", updateCount);
  input.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") startBatch();
  });
  document.getElementById("minimize-window").addEventListener("click", () => windowControls.minimize());
  document.getElementById("maximize-window").addEventListener("click", () => {
    windowControls.isMaximized() ? windowControls.unmaximize() : windowControls.maximize();
  });
  document.getElementById("close-window").addEventListener("click", () => windowControls.close());

  updatePathLabel();
  updateCount();
  setLoginMethod(localStorage.getItem("loginMethod") === "manual" ? "manual" : "browser");
  startDownloadStatusMonitor();

  const initialize = async () => {
    try {
      await waitFor(appRoot);
      await openRoute("/search");
      shell.classList.add("is-ready");
      refreshAccountStatus();
      input.focus();
    } catch (error) {
      shell.classList.add("is-ready");
      showStatus(error?.message || "界面初始化失败。", "error");
    }
  };

  initialize();
})();
