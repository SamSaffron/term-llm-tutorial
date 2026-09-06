#!/usr/bin/env python3
"""Fetch only public boot assets with exact SHA-256 checks; NEVER model weights.
Firmware and the opaque upstream Buildroot image are not redistributed in the archive.
"""
from pathlib import Path
import hashlib, urllib.request, os
ROOT=Path(__file__).resolve().parent.parent
ASSETS=[
 ('linux.bin','https://i.copy.sh/buildroot-bzimage68.bin','507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c'),
 ('seabios.bin','https://raw.githubusercontent.com/copy/v86/d96be774e549a83371b038b86e819804c96b921f/bios/seabios.bin','73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98'),
 ('vgabios.bin','https://raw.githubusercontent.com/copy/v86/d96be774e549a83371b038b86e819804c96b921f/bios/vgabios.bin','a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880'),
]
for name,url,sha in ASSETS:
    target=ROOT/'public'/'assets'/name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==sha:
        print(f'{name}: verified existing file'); continue
    print(f'Fetching {url}',flush=True)
    with urllib.request.urlopen(url,timeout=60) as response:
        data=response.read(32*1024*1024+1)
    if hashlib.sha256(data).hexdigest()!=sha:
        raise SystemExit(f'{name}: SHA-256 mismatch; refusing changed asset')
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix('.tmp');temp.write_bytes(data);os.replace(temp,target)
    print(f'{name}: {len(data):,} bytes verified')
print('Boot assets ready. No model weights fetched. Run python3 scripts/serve.py')
