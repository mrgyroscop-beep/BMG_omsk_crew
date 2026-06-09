param(
  [Parameter(Mandatory=$true)][string]$InputJson,
  [Parameter(Mandatory=$true)][string]$OutputJson
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null

function Await-AsyncOperation($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1

  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  $task.Result
}

$language = [Windows.Globalization.Language]::new("en-US")
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) {
  throw "Windows OCR engine is unavailable."
}

$items = Get-Content -LiteralPath $InputJson -Raw | ConvertFrom-Json
$results = @()

foreach ($item in $items) {
  $path = Resolve-Path -LiteralPath $item.path
  $file = Await-AsyncOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path.Path)) ([Windows.Storage.StorageFile])
  $stream = Await-AsyncOperation ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $decoder = Await-AsyncOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-AsyncOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $ocr = Await-AsyncOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $results += [pscustomobject]@{
    id = $item.id
    name = $item.name
    path = $item.path
    text = $ocr.Text
  }
}

$dir = Split-Path -Parent $OutputJson
if ($dir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $OutputJson -Encoding UTF8
