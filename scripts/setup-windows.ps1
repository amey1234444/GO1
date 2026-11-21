param([switch]$InstallFFmpeg)
$ErrorActionPreference = 'Stop'
Write-Host 'GO1 Windows preflight: microphone and audio files are supported. System playback capture is macOS-only.'
if ($InstallFFmpeg) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'winget not available; install FFmpeg manually from gyan.dev.' }
    winget install --exact --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    Write-Host 'Restart GO1 or the terminal to pick up the updated PATH.'
}
foreach ($name in @('ffmpeg','ffprobe','whisper-cli','whisper-server')) {
    $command = Get-Command "$name.exe" -ErrorAction SilentlyContinue
    if ($command) { Write-Host "OK: $name = $($command.Source)" }
    else { Write-Warning "$name.exe not found in PATH" }
}
Write-Host ''
Write-Host 'To build whisper.cpp on Windows, install Git, CMake, and the Visual Studio C++ Build Tools.'
Write-Host 'git clone https://github.com/ggml-org/whisper.cpp.git'
Write-Host 'cmake -S whisper.cpp -B whisper.cpp/build -A x64 -DWHISPER_BUILD_TESTS=OFF'
Write-Host 'cmake --build whisper.cpp/build --config Release --parallel'
Write-Host 'Add the directory containing whisper-cli.exe and whisper-server.exe to your user PATH, or set GO1_WHISPER_PATH and GO1_WHISPER_SERVER_PATH before launching GO1.'
Write-Host 'Then install a multilingual model from the GO1 interface and select Recheck.'
