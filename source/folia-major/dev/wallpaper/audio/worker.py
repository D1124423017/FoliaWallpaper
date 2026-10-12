import collections
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
runtime = Path(sys.argv[1]).resolve()
os.environ['HF_HOME'] = str(runtime / 'hf-cache')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
import numpy as np
import soundcard as sc
from device import prepare_device
from faster_whisper import WhisperModel

stopped = threading.Event()
lock = threading.Lock()
context = None
jobs = queue.Queue(maxsize=1)


def emit(data):
    try:
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


def capture():
    while not stopped.is_set():
        first = current()
        if not first:
            stopped.wait(.3)
            continue
        try:
            # All channels avoids SoundCard's documented single-channel WASAPI issue.
            speaker = sc.default_speaker()
            loopback = sc.get_microphone(id=speaker.id, include_loopback=True)
            if not loopback.isloopback:
                raise RuntimeError('Expected loopback')
            chunks = collections.deque(maxlen=48)
            emitted_at = 0.0
            generation = first['generation']
            with loopback.recorder(samplerate=48000, blocksize=2400) as recorder:
                while not stopped.is_set():
                    data = current()
                    if not data or data['generation'] != generation:
                        break
                    started = time.time()
                    audio = recorder.record(numframes=24000)
                    mono = np.asarray(audio, dtype=np.float32).mean(axis=1)
                    position = data['positionSec'] + (started * 1000 - data['at']) / 1000 * data['playbackRate']
                    chunks.append((mono, position))
                    if len(chunks) < 40 or started - emitted_at < 12:
                        continue
                    emitted_at = started
                    selected = list(chunks)[-40:]
                    samples = np.concatenate([chunk[0] for chunk in selected])
                    if float(np.sqrt(np.mean(samples * samples))) < .001:
                        continue
                    task = {'generation': generation, 'key': data['key'], 'positionSec': selected[0][1],
                            'playbackRate': data['playbackRate'], 'audio': samples}
                    if jobs.full():
                        try:
                            jobs.get_nowait()
                        except queue.Empty:
                            pass
                    jobs.put_nowait(task)
        except Exception as error:
            emit({'type': 'status', 'status': 'device-error', 'errorType': type(error).__name__})
            stopped.wait(5)


def audio_stream(samples):
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(48000)
        writer.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    stream.seek(0)
    return stream


threading.Thread(target=receive, daemon=True).start()
try:
    device, precision = prepare_device(runtime)
    model = WhisperModel('small', device=device, compute_type=precision, cpu_threads=2, num_workers=1,
                         download_root=str(runtime / 'models'), local_files_only=True)
    emit({'type': 'status', 'status': 'ready', 'model': 'small', 'threads': 2, 'device': device})
    threading.Thread(target=capture, daemon=True).start()
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
        for segment in segments:
            if segment.no_speech_prob > .6 or segment.avg_logprob < -1.2:
                continue
            for word in segment.words or []:
                if word.probability >= .35:
                    words.append({'text': word.word, 'timeSec': task['positionSec'] + word.start * task['playbackRate'],
                                  'probability': word.probability})
        data = current()
        if data and data['generation'] == task['generation'] and not stopped.is_set():
            emit({'type': 'heard', 'key': task['key'], 'generation': task['generation'], 'words': words[:240],
                  'inferenceSec': round(time.monotonic() - begin, 2)})
except Exception as error:
    emit({'type': 'status', 'status': 'model-error', 'errorType': type(error).__name__})
finally:
    stopped.set()
