$Uri = [string] $args[0]
$Destination = [string] $args[1]
$TimeoutSeconds = if ($args.Count -gt 2) { [int] $args[2] } else { 90 }

if (-not $Uri) { throw 'Missing Uri argument.' }
if (-not $Destination) { throw 'Missing Destination argument.' }

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$directory = [System.IO.Path]::GetDirectoryName($Destination)
if ($directory) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$headers = @{
  'User-Agent' = 'Mozilla/5.0'
  'Accept-Encoding' = 'identity'
}

Invoke-WebRequest -Uri $Uri -OutFile $Destination -TimeoutSec $TimeoutSeconds -Headers $headers
