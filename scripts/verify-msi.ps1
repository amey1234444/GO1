$ErrorActionPreference = 'Stop'
$msi = @(Get-ChildItem -Path 'out/make' -Recurse -File -Filter '*.msi')
if ($msi.Count -ne 1) { throw "Expected exactly one MSI; found $($msi.Count)." }
if ($msi[0].Length -lt 1000000) { throw 'MSI suspiciously small.' }
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($msi[0].FullName, 0)
function Get-MsiProperty([string]$key) {
    $view = $database.OpenView("SELECT `Value` FROM `Property` WHERE `Property` = '$key'")
    $view.Execute()
    $record = $view.Fetch()
    $result = if ($null -eq $record) { $null } else { $record.StringData(1) }
    $view.Close()
    return $result
}
if ((Get-MsiProperty 'ProductName') -ne 'GO1') { throw 'Missing GO1 ProductName metadata.' }
if (-not (Get-MsiProperty 'ProductVersion')) { throw 'Missing ProductVersion.' }
if (-not (Get-MsiProperty 'UpgradeCode')) { throw 'Missing stable UpgradeCode.' }
Write-Host "Validated MSI: $($msi[0].FullName) ($($msi[0].Length) bytes)"
Write-Host 'Note: metadata validation does not prove live audio transcription or signature trust.'
