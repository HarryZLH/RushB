$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms

$running = Get-Process -Name 'RushB', 'Bilidown', 'Bilidown Lite' -ErrorAction SilentlyContinue
if ($running) {
    [System.Windows.Forms.MessageBox]::Show(
        'RushB 或 Bilidown 正在运行。请先从 RushB 托盘菜单选择“退出”或关闭 Bilidown，再启动以加载更新。',
        'RushB',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    exit 0
}

$exe = Join-Path $PSScriptRoot 'RushB.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    [System.Windows.Forms.MessageBox]::Show(
        "找不到程序文件：`n$exe",
        'RushB',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot | Out-Null
