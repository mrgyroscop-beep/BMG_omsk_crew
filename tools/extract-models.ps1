param(
  [string]$DataJsPath = (Join-Path $PSScriptRoot "..\\data.js"),
  [string]$ModelsJsonPath = (Join-Path $PSScriptRoot "..\\data-source\\models.json")
)

$ErrorActionPreference = "Stop"

function Get-ModelsJsonFromDataJs {
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

  $modelsChunk = $RawText.Substring($startIndex, $endIndex - $startIndex)
  $modelsJson = $modelsChunk `
    -replace '^const models = ', '' `
    -replace ';\s*$', '' `
    -replace '(?m)^\s*//.*$', '' `
    -replace ',(\s*[}\]])', '$1'

  return $modelsJson.Trim()
}

function ConvertTo-Slug {
  param(
    [string]$Text
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    $value = "model"
  } else {
    $value = $Text
  }
  $value = $value.ToLowerInvariant()
  $value = [regex]::Replace($value, '[^a-z0-9]+', '-')
  $value = $value.Trim('-')
  if ([string]::IsNullOrWhiteSpace($value)) {
    return "model"
  }
  return $value
}

function Add-StableModelIds {
  param(
    [object[]]$Items
  )

  $usedIds = @{}

  foreach ($item in $Items) {
    if ($null -eq $item.PSObject.Properties['id'] -or [string]::IsNullOrWhiteSpace([string]$item.id)) {
      $baseId = @(
        (ConvertTo-Slug $item.name),
        (ConvertTo-Slug $item.realname),
        (ConvertTo-Slug $item.base)
      ) -join "-"

      $candidate = $baseId
      $suffix = 2
      while ($usedIds.ContainsKey($candidate)) {
        $candidate = "$baseId-$suffix"
        $suffix++
      }

      $item | Add-Member -NotePropertyName id -NotePropertyValue $candidate
      $usedIds[$candidate] = $true
    } else {
      $existingId = [string]$item.id
      $candidate = $existingId
      $suffix = 2
      while ($usedIds.ContainsKey($candidate)) {
        $candidate = "$existingId-$suffix"
        $suffix++
      }
      $item.id = $candidate
      $usedIds[$candidate] = $true
    }
  }

  return $Items
}

$resolvedDataJsPath = (Resolve-Path $DataJsPath).Path
$modelsDir = Split-Path -Parent $ModelsJsonPath
if (-not (Test-Path $modelsDir)) {
  New-Item -ItemType Directory -Path $modelsDir | Out-Null
}

$raw = Get-Content -Path $resolvedDataJsPath -Raw -Encoding UTF8
$modelsJson = Get-ModelsJsonFromDataJs -RawText $raw
$models = $modelsJson | ConvertFrom-Json
$models = Add-StableModelIds -Items $models

$prettyJson = $models | ConvertTo-Json -Depth 100
Set-Content -Path $ModelsJsonPath -Value $prettyJson -Encoding UTF8

Write-Host "Extracted $($models.Count) models to $ModelsJsonPath"
