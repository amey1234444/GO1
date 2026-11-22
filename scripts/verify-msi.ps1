$ErrorActionPreference = 'Stop'
$msi = @(Get-ChildItem -Path 'out/make' -Recurse -File -Filter '*.msi')
if ($msi.Count -ne 1) { throw "Expected exactly one MSI; found $($msi.Count)." }
if ($msi[0].Length -lt 1000000) { throw 'MSI suspiciously small.' }
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($msi[0].FullName, 0)
function Get-MsiProperty([string]$key) {
    $query = 'SELECT `Value` FROM `Property` WHERE `Property` = ''{0}''' -f $key
    $view = $database.OpenView($query)
    [void]$view.Execute()
    $record = $view.Fetch()
    $result = if ($null -eq $record) { '' } else { ([string]$record.StringData(1)).Trim() }
    [void]$view.Close()
    return $result
}
# electron-wix-msi's template adds this suffix to the internal MSI ProductName.
# The visible app/shortcut name is still GO1. Accept only these known exact names.
$productName = Get-MsiProperty 'ProductName'
if ($productName -notin @('GO1', 'GO1 (Machine - MSI)')) { throw "Unexpected MSI ProductName: $productName" }
# Use the same SemVer-to-four-part conversion as electron-wix-msi.
$expectedVersion = & node -e "process.stdout.write(require('electron-wix-msi/lib/utils/version-util').getWindowsCompliantVersion(require('./package.json').version))"
if ($LASTEXITCODE -ne 0) { throw 'Could not calculate the expected MSI version.' }
$productVersion = Get-MsiProperty 'ProductVersion'
if ($productVersion -ne $expectedVersion) { throw "MSI version $productVersion does not match $expectedVersion" }
$upgradeCode = Get-MsiProperty 'UpgradeCode'
if ($upgradeCode.Trim('{}') -ne '6DD60BAC-2AC4-41AC-BB14-8FC5F194B918') { throw "Unexpected MSI UpgradeCode: $upgradeCode" }
Write-Host "MSI metadata: $productName / $productVersion / $upgradeCode"
Write-Host "Validated MSI: $($msi[0].FullName) ($($msi[0].Length) bytes)"
Write-Host 'Note: metadata validation does not prove live audio transcription or signature trust.'
