param([string]$MeterSource, [int]$OwnerPid, [switch]$Once)

# dev/wallpaper/media/read-media.ps1 — read Windows SMTC and output peaks without controlling any player.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$randomStreamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$adapter = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1
} | Select-Object -First 1
function Wait-Operation($Operation, [Type]$ResultType) {
    $task = $adapter.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(2500)) { throw 'Media read timeout' }
    $task.GetAwaiter().GetResult()
}
function Read-Cover($Reference) {
    if (-not $Reference) { return $null }
    $stream = $null; $reader = $null
    try {
        $stream = Wait-Operation $Reference.OpenReadAsync() $streamType
        $convert = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1
        } | Select-Object -First 1
        $reader = $convert.Invoke($null, @($stream))
        if ($reader.Length -gt 524288 -or $reader.Length -lt 12) { return $null }
        $bytes = New-Object byte[] $reader.Length
        $loaded = 0
        while ($loaded -lt $bytes.Length) {
            $count = $reader.Read($bytes, $loaded, $bytes.Length - $loaded)
            if ($count -eq 0) { return $null }
            $loaded += $count
        }
        $format = if ($bytes[0] -eq 137 -and [Text.Encoding]::ASCII.GetString($bytes, 1, 3) -eq 'PNG') { 'png' }
            elseif ($bytes[0] -eq 255 -and $bytes[1] -eq 216) { 'jpeg' }
            elseif ([Text.Encoding]::ASCII.GetString($bytes, 0, 2) -eq 'BM') { 'bmp' }
            elseif ([Text.Encoding]::ASCII.GetString($bytes, 0, 4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -eq 'WEBP') { 'webp' }
            else { return $null }
        return ('data:image/' + $format + ';base64,' + [Convert]::ToBase64String($bytes))
    } catch { if ($Once) { [Console]::Error.WriteLine('Cover: ' + $_.Exception.Message) }; return $null }
    finally {
        foreach ($resource in @($reader, $stream)) {
            if ($resource) { try { ([IDisposable]$resource).Dispose() } catch { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($resource) } catch { } } }
        }
    }
}
$manager = Wait-Operation $managerType::RequestAsync() $managerType
$meter = $null
try { Add-Type -Path $MeterSource; $meter = New-Object FoliaWallpaper.OutputMeter } catch { if ($Once) { [Console]::Error.WriteLine('Meter: ' + $_.Exception.Message) } }
$covers = @{}
$owner = if ($OwnerPid -gt 0) { [Diagnostics.Process]::GetProcessById($OwnerPid) } else { $null }
$tick = 0; $peak = 0.0
try {
    do {
        if ($meter) {
            try {
                if ($tick % 20 -eq 0) { $meter.Refresh() }
                $peak = [Math]::Max($peak, $meter.Read())
            } catch { if ($Once) { [Console]::Error.WriteLine('Peak: ' + $_.Exception.Message) } }
        }
        if ($tick % 4 -eq 0) {
            $at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $items = @()
            $current = $manager.GetCurrentSession()
            $currentId = if ($current) { $current.SourceAppUserModelId } else { '' }
            foreach ($session in @($manager.GetSessions()) | Select-Object -First 16) {
                try {
                    $properties = Wait-Operation $session.TryGetMediaPropertiesAsync() $propertiesType
                    if (-not $properties.Title -or $properties.Title.Length -gt 500) { continue }
                    $playback = $session.GetPlaybackInfo()
                    $timeline = $session.GetTimelineProperties()
                    $app = [string]$session.SourceAppUserModelId
                    $key = $app + '|' + $properties.Title + '|' + $properties.Artist
                    if (-not $covers.ContainsKey($key) -or $at - $covers[$key].at -gt 8000) {
                        $covers[$key] = @{ at=$at; value=(Read-Cover $properties.Thumbnail) }
                    }
                    $playing = [string]$playback.PlaybackStatus -eq 'Playing'
                    $rate = if ($null -ne $playback.PlaybackRate) { [double]$playback.PlaybackRate } else { 1.0 }
                    if ($rate -lt 0.0625 -or $rate -gt 16) { $rate = 1.0 }
                    $duration = [Math]::Max(0.0, [double]($timeline.EndTime - $timeline.StartTime).TotalSeconds)
                    $position = [Math]::Max(0.0, [double]($timeline.Position - $timeline.StartTime).TotalSeconds)
                    # SMTC position is anchored to LastUpdatedTime, not the time of this poll.
                    if ($playing -and $duration -gt 0) {
                        $elapsed = [Math]::Max(0.0, [double]([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalSeconds)
                        $position = [Math]::Min($duration, $position + $elapsed * $rate)
                    }
                    $items += @{ title=[string]$properties.Title; artist=[string]$properties.Artist; album=[string]$properties.AlbumTitle;
                        app=$app; current=($app -eq $currentId); playing=$playing; playbackRate=$rate;
                        duration=$duration; position=$position; at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); cover=$covers[$key].value }
                } catch { if ($Once) { [Console]::Error.WriteLine('Session: ' + $_.Exception.Message) } }
            }
            if ($covers.Count -gt 32) { $covers.Clear() }
            @{ app='FoliaWindowsMedia'; schema=1; at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); sessions=@($items);
                audio=@{ peak=$peak; available=($null -ne $meter -and $meter.DeviceCount -gt 0) } } | ConvertTo-Json -Depth 5 -Compress | Write-Output
            $peak = 0.0
            if ($Once) { break }
        }
        $tick++
        Start-Sleep -Milliseconds 250
    } while ($owner -and -not $owner.HasExited)
} finally { if ($meter) { $meter.Dispose() }; if ($owner) { $owner.Dispose() } }
