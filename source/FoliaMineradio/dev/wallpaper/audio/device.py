import os
from pathlib import Path

# dev/wallpaper/audio/device.py — expose only this isolated environment's NVIDIA DLLs to this Python process.
handles = []


def prepare_device(runtime):
    site = Path(runtime) / '.venv' / 'Lib' / 'site-packages' / 'nvidia'
    for name in ('cuda_runtime', 'cublas', 'cudnn'):
        directory = site / name / 'bin'
        if directory.is_dir():
            os.environ['PATH'] = str(directory) + os.pathsep + os.environ.get('PATH', '')
            handles.append(os.add_dll_directory(str(directory)))
    try:
        import ctranslate2
        if handles and 'int8_float16' in ctranslate2.get_supported_compute_types('cuda'):
            return 'cuda', 'int8_float16'
    except (RuntimeError, OSError):
        pass
    return 'cpu', 'int8'
