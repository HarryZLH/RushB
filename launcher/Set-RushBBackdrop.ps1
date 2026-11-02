param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$HwndHex,
    [Parameter(Position = 1)]
    [ValidateSet('system', 'none')]
    [string]$BackdropMode = 'system'
)

$ErrorActionPreference = 'Stop'
$logFiles = @(
    (Join-Path $PSScriptRoot 'backdrop.log'),
    (Join-Path (Join-Path $env:LOCALAPPDATA 'RushB\logs') 'backdrop.log')
)

function Write-BackdropLog([string]$Message) {
    foreach ($candidate in $logFiles) {
        try {
            $candidateDirectory = Split-Path -Parent $candidate
            if (-not (Test-Path -LiteralPath $candidateDirectory)) {
                New-Item -ItemType Directory -Path $candidateDirectory -Force | Out-Null
            }
            Add-Content -LiteralPath $candidate -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
            return
        }
        catch { }
    }
}

$nativeCode = @'
using System;
using System.Runtime.InteropServices;

public static class RushBDwm
{
    [DllImport("user32.dll", EntryPoint = "IsWindow", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr hwnd);

    [DllImport("dwmapi.dll", EntryPoint = "DwmSetWindowAttribute", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(
        IntPtr hwnd, uint attribute, ref int value, uint valueSize);

    public static int SetAttribute(IntPtr hwnd, uint attribute, int value)
    {
        return DwmSetWindowAttribute(hwnd, attribute, ref value, sizeof(int));
    }

    public static string FormatHResult(int value)
    {
        return unchecked((uint)value).ToString("X8");
    }
}
'@

try {
    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # Electron returns a native HWND buffer in little-endian byte order.
    $handleBytes = New-Object byte[] ([IntPtr]::Size)
    $byteCount = [Math]::Min($handleBytes.Length, [int]($HwndHex.Length / 2))
    for ($index = 0; $index -lt $byteCount; $index++) {
        $handleBytes[$index] = [Convert]::ToByte($HwndHex.Substring($index * 2, 2), 16)
    }
    if ([IntPtr]::Size -eq 8) {
        $handle = [IntPtr]([BitConverter]::ToInt64($handleBytes, 0))
    }
    else {
        $handle = [IntPtr]([BitConverter]::ToInt32($handleBytes, 0))
    }

    if (-not [RushBDwm]::IsWindow($handle)) {
        Write-BackdropLog "Invalid HWND supplied by Electron; bytes=$HwndHex"
        exit 2
    }

    $build = [Environment]::OSVersion.Version.Build
    $darkResult = [RushBDwm]::SetAttribute($handle, 20, 1)
    # DWMWCP_ROUND (2); the CSS window shell uses the matching 8px radius.
    $cornerResult = [RushBDwm]::SetAttribute($handle, 33, 2)
    Write-BackdropLog "Applying documented DWM backdrop; build=$build; hwnd=0x$HwndHex; darkHr=0x$([RushBDwm]::FormatHResult($darkResult)); cornerHr=0x$([RushBDwm]::FormatHResult($cornerResult))"

    if ($build -lt 22621) {
        Write-BackdropLog "DWMWA_SYSTEMBACKDROP_TYPE unavailable on build $build; Windows 11 build 22621 or newer is required."
    }
    else {
        if ($BackdropMode -eq 'none') {
            $result = [RushBDwm]::SetAttribute($handle, 38, 1)
            Write-BackdropLog "DWMWA_SYSTEMBACKDROP_TYPE=DWMSBT_NONE(1); HRESULT=0x$([RushBDwm]::FormatHResult($result))"
        }
        else {
            # DWMSBT_TRANSIENTWINDOW (3) maps to Desktop Acrylic on Windows 11.
            $result = [RushBDwm]::SetAttribute($handle, 38, 3)
            Write-BackdropLog "DWMWA_SYSTEMBACKDROP_TYPE=DWMSBT_TRANSIENTWINDOW(3); HRESULT=0x$([RushBDwm]::FormatHResult($result))"
        }
    }
}
catch {
    Write-BackdropLog "DWM backdrop helper failed; error=$($_.Exception.Message)"
}
