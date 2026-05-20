param(
  [string]$BaseDataJsPath = (Join-Path $PSScriptRoot "..\\data.js"),
  [string]$ModelsJsonPath = (Join-Path $PSScriptRoot "..\\data-source\\models.json"),
  [string]$OutputDataJsPath = (Join-Path $PSScriptRoot "..\\data.generated.js")
)

$ErrorActionPreference = "Stop"

function Get-DataJsParts {
  param(
    [string]$RawText
  )

  $startMarker = "const models = ["
  $endMarker = "window.models = models;"

  $startIndex = $RawText.IndexOf($startMarker)
  if ($startIndex -lt 0) {
    throw "Не найден маркер начала массива models."
  }

  $endIndex = $RawText.IndexOf($endMarker, $startIndex)
  if ($endIndex -lt 0) {
    throw "Не найден маркер конца массива models."
  }

  return @{
    Prefix = $RawText.Substring(0, $startIndex)
    Suffix = $RawText.Substring($endIndex)
  }
}

$resolvedBaseDataJsPath = (Resolve-Path $BaseDataJsPath).Path
$resolvedModelsJsonPath = (Resolve-Path $ModelsJsonPath).Path

$baseRaw = Get-Content -Path $resolvedBaseDataJsPath -Raw -Encoding UTF8
$parts = Get-DataJsParts -RawText $baseRaw
$models = Get-Content -Path $resolvedModelsJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$modelsJson = $models | ConvertTo-Json -Depth 100
$modelsBlock = "const models = $modelsJson`r`n`r`n"
$rebuilt = $parts.Prefix + $modelsBlock + $parts.Suffix

Set-Content -Path $OutputDataJsPath -Value $rebuilt -Encoding UTF8

Write-Host "Built data file with $($models.Count) models to $OutputDataJsPath"
