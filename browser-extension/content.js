(() => {
  const current = new URL(location.href);
  const token = current.searchParams.get("token");
  const status = document.getElementById("bridge-status");
  if (!token || current.pathname !== "/import") return;

  chrome.runtime.sendMessage({ type: "rushb-import", token }, (result) => {
    if (chrome.runtime.lastError) {
      if (status) status.textContent = "扩展连接失败，请在设置中确认扩展已加载后重试。";
      return;
    }
    if (status) status.textContent = result?.ok
      ? "账号状态已发送。返回 RushB 查看验证结果。"
      : (result?.error || "导入失败，请确认浏览器已登录 B 站后重试。");
  });
})();
