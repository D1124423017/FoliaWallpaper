from pathlib import Path
import json
import os
import time

# Download the official CTranslate2 Whisper model into this isolated runtime; no audio input.
root = Path(__file__).resolve().parent
os.environ['HF_HOME'] = str(root / 'hf-cache')
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
from faster_whisper import WhisperModel
start = time.monotonic()
model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, download_root=str(root / 'models'))
(root / 'ready.json').write_text(json.dumps({'model':'small','device':'cpu','compute':'int8','threads':2,'loadSeconds':round(time.monotonic()-start,2)}), encoding='utf8')
print('Local model ready; no audio recorded.', flush=True)
