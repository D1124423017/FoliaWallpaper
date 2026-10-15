import collections
import base64
import io
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
import wave

# dev/wallpaper/audio/worker.py — bounded in-memory WASAPI loopback; never uses a microphone or writes recordings.
# Node writes UTF-8 JSON; Windows legacy console encodings corrupt Chinese track keys and reject every result.
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
runtime = Path(sys.argv[1]).resolve()
os.environ['HF_HOME'] = str(runtime / 'hf-cache')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
import numpy as np
import soundcard as sc
from device import prepare_device

stopped = threading.Event()
lock = threading.Lock()
emit_lock = threading.Lock()
context = None
available_outputs = set()
jobs = queue.Queue(maxsize=8)


def emit(data):
    try:
        with emit_lock:
            print(json.dumps(data, ensure_ascii=True), flush=True)
    except (BrokenPipeError, OSError):
        stopped.set()


def receive():
    global context
    try:
        for line in sys.stdin:
            data = json.loads(line)
            if data.get('type') == 'stop':
                break
            if data.get('type') == 'context':
                with lock:
                    context = data
    finally:
        stopped.set()


def current():
    with lock:
        data = context.copy() if context else None
    return data if data and data.get('active') and abs(time.time() * 1000 - data['at']) < 4000 else None


def capture(speaker):
    while not stopped.is_set() and speaker.id in available_outputs:
        first = current()
        if not first or first.get('outputDevice') and first['outputDevice'] != speaker.id:
            stopped.wait(.3)
            continue
        try:
            # All channels avoids SoundCard's documented single-channel WASAPI issue.
            loopback = sc.get_microphone(id=speaker.id, include_loopback=True)
            if not loopback.isloopback:
                raise RuntimeError('Expected loopback')
            chunks = collections.deque(maxlen=48)
            emitted_at = 0.0
            cloud_emitted_at = 0.0
            generation = first['generation']
            with loopback.recorder(samplerate=48000, blocksize=2400) as recorder:
                while not stopped.is_set():
                    data = current()
                    if not data or data['generation'] != generation:
                        break
                    if speaker.id not in available_outputs:
                        return
                    if data.get('outputDevice') and data['outputDevice'] != speaker.id:
                        break
                    started = time.time()
                    audio = recorder.record(numframes=24000)
                    mono = np.asarray(audio, dtype=np.float32).mean(axis=1)
                    position = data['positionSec'] + (started * 1000 - data['at']) / 1000 * data['playbackRate']
                    chunks.append((mono, position))
                    if data.get('gemini') and len(chunks) >= 20 and started - cloud_emitted_at >= 20:
                        selected_cloud = list(chunks)[-20:]
                        cloud_samples = np.concatenate([chunk[0] for chunk in selected_cloud])
                        if float(np.sqrt(np.mean(cloud_samples * cloud_samples))) >= .001:
                            cloud_emitted_at = started
                            # Simple low-pass averaging before 48 -> 16 kHz decimation; only 10 s, mono PCM16.
                            downsampled = cloud_samples.reshape(-1, 3).mean(axis=1)
                            emit({'type': 'clip', 'key': data['key'], 'generation': generation,
                                  'positionSec': selected_cloud[0][1], 'playbackRate': data['playbackRate'],
                                  'durationSec': len(downsampled) / 16000, 'outputDevice': speaker.id,
                                  'audio': base64.b64encode(audio_stream(downsampled, 16000).getvalue()).decode('ascii')})
                    local_blocks = 24 if emitted_at == 0 else 40
                    if len(chunks) < local_blocks or started - emitted_at < 12:
                        continue
                    emitted_at = started
                    selected = list(chunks)[-local_blocks:]
                    samples = np.concatenate([chunk[0] for chunk in selected])
                    silent = float(np.sqrt(np.mean(samples * samples))) < .001
                    emit({'type': 'capture', 'silent': silent})
                    if silent:
                        continue
                    task = {'generation': generation, 'key': data['key'], 'positionSec': selected[0][1],
                            'playbackRate': data['playbackRate'], 'audio': samples, 'outputDevice': speaker.id}
                    if jobs.full():
                        try:
                            jobs.get_nowait()
                        except queue.Empty:
                            pass
                    jobs.put_nowait(task)
        except Exception as error:
            emit({'type': 'capture', 'deviceError': True})
            stopped.wait(5)


def capture_outputs():
    # A player can use headphones or a monitor instead of the Windows default output.
    # Keep device streams separate; only a transcript that matches the actual song can authorize its clock.
    running = {}
    global available_outputs
    while not stopped.is_set():
        try:
            speakers = sc.all_speakers()[:8]
            available_outputs = {speaker.id for speaker in speakers}
            running = {device: thread for device, thread in running.items() if device in available_outputs and thread.is_alive()}
            for speaker in speakers:
                if speaker.id not in running or not running[speaker.id].is_alive():
                    thread = threading.Thread(target=capture, args=(speaker,), daemon=True)
                    running[speaker.id] = thread
                    thread.start()
        except Exception:
            emit({'type': 'status', 'status': 'device-error'})
        stopped.wait(5)


def audio_stream(samples, samplerate=48000):
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(samplerate)
        writer.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    stream.seek(0)
    return stream


threading.Thread(target=receive, daemon=True).start()
# Capture starts before loading Whisper, so the short cloud path and first local window do not wait for the model.
threading.Thread(target=capture_outputs, daemon=True).start()
try:
    from faster_whisper import WhisperModel
    device, precision = prepare_device(runtime)
    model = WhisperModel('small', device=device, compute_type=precision, cpu_threads=2, num_workers=1,
                         download_root=str(runtime / 'models'), local_files_only=True)
    emit({'type': 'status', 'status': 'ready', 'model': 'small', 'threads': 2, 'device': device})
    while not stopped.is_set():
        try:
            task = jobs.get(timeout=.5)
        except queue.Empty:
            continue
        data = current()
        if not data or data['generation'] != task['generation']:
            continue
        begin = time.monotonic()
        segments, info = model.transcribe(audio_stream(task['audio']), beam_size=3, word_timestamps=True,
                                         condition_on_previous_text=False, vad_filter=False, temperature=0)
        words = []
        seen_segments = rejected_segments = 0
        for segment in segments:
            seen_segments += 1
            # Match Whisper's silence rule: a high music/no-speech estimate must not discard a confident vocal transcript.
            if segment.no_speech_prob > .6 and segment.avg_logprob < -1.2:
                rejected_segments += 1
                continue
            for word in segment.words or []:
                if word.probability >= .35:
                    words.append({'text': word.word, 'timeSec': task['positionSec'] + word.start * task['playbackRate'],
                                  'probability': word.probability})
        data = current()
        if data and data['generation'] == task['generation'] and not stopped.is_set():
            emit({'type': 'heard', 'key': task['key'], 'generation': task['generation'], 'words': words[:240],
                  'inferenceSec': round(time.monotonic() - begin, 2), 'language': info.language,
                  'segments': seen_segments, 'rejectedSegments': rejected_segments, 'outputDevice': task['outputDevice']})
except Exception as error:
    emit({'type': 'status', 'status': 'model-error', 'errorType': type(error).__name__})
finally:
    stopped.set()
