param(
  [Parameter(Mandatory = $true)][int]$JobId,
  [Parameter(Mandatory = $true)][int]$NewsId,
  [string]$ApiUrl = "http://localhost:3000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $ScriptDir "..\my-video"
$GeneratedDir = Join-Path $ProjectDir "generated\$NewsId"
$OutputPath = Join-Path $ProjectDir "renders\$NewsId.mp4"

function Update-Job([string]$Status, [string]$ErrorMessage = "", [string]$Path = "") {
  $body = @{ status = $Status }
  if ($ErrorMessage) { $body.error_message = $ErrorMessage }
  if ($Path) { $body.output_path = $Path }
  Invoke-RestMethod -Method Patch -Uri "$ApiUrl/api/jobs/$JobId/status" -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 5) | Out-Null
}

try {
  if (-not (Test-Path $GeneratedDir)) { throw "Generated composition not found: $GeneratedDir" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
  Update-Job "rendering"
  Push-Location $ProjectDir
  npx hyperframes@0.8.46 lint
  npx hyperframes@0.8.46 check
  npx hyperframes@0.8.46 render --output "renders/$NewsId.mp4"
  Pop-Location
  Update-Job "completed" -Path "renders/$NewsId.mp4"
  Write-Output "[OK] Render completed: $OutputPath"
  exit 0
}
catch {
  Pop-Location -ErrorAction SilentlyContinue
  $message = $_.Exception.Message
  try { Update-Job "failed" -ErrorMessage $message } catch { Write-Warning "Could not update job: $($_.Exception.Message)" }
  Write-Error $message
  exit 1
}