const COOKIE_NAMES = new Set([
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "sid",
  "buvid3",
  "buvid4",
  "buvid_fp",
  "buvid_fp_plain",
  "b_nut",
  "CURRENT_FNVAL",
  "CURRENT_QUALITY",
  "CURRENT_PID",
  "_uuid"
]);

function isBilibiliDomain(domain = "") {
  return /^\.?(?:[a-z0-9-]+\.)*bilibili\.com$/i.test(domain);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "rushb-import") return false;

  (async () => {
    const page = sender.tab?.url ? new URL(sender.tab.url) : null;
    if (!page || page.protocol !== "http:" || page.hostname !== "127.0.0.1" || page.pathname !== "/import" || page.searchParams.get("token") !== message.token || !/^[a-f0-9]{64}$/.test(message.token || "")) {
      throw new Error("只接受 RushB 本机发起的账号导入。");
    }

    const cookies = await chrome.cookies.getAll({ domain: "bilibili.com" });
    const selected = cookies
      .filter((cookie) => COOKIE_NAMES.has(cookie.name) && isBilibiliDomain(cookie.domain))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate
      }));

    const response = await fetch(`http://127.0.0.1:${page.port}/cookies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RushB-Token": message.token
      },
      body: JSON.stringify({ cookies: selected }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`RushB 本地连接返回 ${response.status}`);
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: error.message || "读取浏览器登录状态失败。" }));

  return true;
});
