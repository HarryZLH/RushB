# RushB（B站视频下载器）

RushB（B站视频下载器） is a compact Windows desktop interface for batch downloading Bilibili videos. It reuses the local Bilidown 1.2.7 parser and download engine, selects the highest quality available to the current account, and supports both browser-cookie import and in-app QR login.

## Features

- Paste one or more Bilibili URLs, one per line.
- Regular multi-page videos download every page by default. Series show an episode picker, preselecting the episode from the pasted URL; choose individual episodes, select all, or skip that link.
- A URL containing `?p=` preselects the requested page or episode.
- Automatically select the highest available video and audio quality.
- Set a destination folder and inspect the current account status.
- Click the compact circular title-bar button to see active, queued, paused, and failed tasks with progress and speed, or switch to the downloaded-records tab. Each downloaded record has a folder button that opens its saved download directory.
- Open the download folder from the title-bar download panel. Set the save path and view the highest available quality in Settings.
- Import Bilibili login cookies from the default Edge or Chrome profile with the included browser extension, or use the built-in QR login page.
- Open **Settings → Software statement** for source attribution, content-use rules, local login-data handling, and the disclaimer.
- Dark by default, with higher-opacity Fluent surfaces over real Windows Desktop Acrylic. On Windows build 22621+, the app calls the documented `DwmSetWindowAttribute` API with `DWMWA_SYSTEMBACKDROP_TYPE=DWMSBT_TRANSIENTWINDOW` for the whole window. The bundled Electron 13.6.9 runtime does not expose Electron's newer `backgroundMaterial` method, so RushB passes its native window handle to the Windows helper. The helper logs results to the program folder's `backdrop.log`, falling back to `%LOCALAPPDATA%\RushB\logs\backdrop.log`.
- Minimal interface with downloads shown only in the compact task panel.

## Build on Windows

Install Bilidown 1.2.7 locally, then point `BILIDOWN_DIR` at its installation directory and run the builder:

```powershell
$env:BILIDOWN_DIR = 'C:\Path\To\Bilidown'
python .\build_rushb.py
```

The build writes to `dist\`. Set `RUSHB_OUTPUT` to choose another output directory. The builder copies the local Bilidown runtime and patches its ASAR archive with the RushB interface; the upstream installer and runtime are not stored in this repository.

## Browser login bridge

RushB reuses the local Bilidown user-data directory (`%APPDATA%\bilidown`) so an existing Bilidown login session is available on startup. Both applications share this profile. Before switching or applying an update, fully quit RushB from its tray menu and close Bilidown; otherwise the old process can receive the next launch request.

To import a separate Edge or Chrome session, load `browser-extension/` as an unpacked extension. In the browser selected as the system default, sign in to Bilibili. In RushB, open **Settings → From browser** and start the import. The extension transfers only the listed Bilibili login cookies through a one-time token to the local RushB process. The import is user-initiated each time.

## Source attribution

RushB is a modified version of Bilidown by Bilibili creator **@王子周棋洛**. The original project is no longer maintained and is now being refined and updated by **@Harry张**.
The original project's source availability and license scope have not been verified. This attribution does not imply endorsement or grant additional rights.

## Project layout

- `src/rushb_ui.js` and `src/rushb_ui.css`: desktop interface and batch download flow.
- `browser-extension/`: Edge and Chrome login bridge.
- `launcher/`: Windows launch scripts and a native backdrop helper that applies DWM Desktop Acrylic, dark title bar, rounded corners, and result logging.
- `build_rushb.py`: packages RushB over a local Bilidown installation.
