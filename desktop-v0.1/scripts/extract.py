import tarfile, zipfile, sys
from pathlib import Path

archive, target, kind = sys.argv[1:]
root = Path(target).resolve()
root.mkdir(parents=True, exist_ok=True)
def save(name, data):
    dest = (root / name).resolve()
    if not dest.is_relative_to(root): raise ValueError('Unsafe archive path')
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open('xb') as f: f.write(data)
if kind == 'tar':
    with tarfile.open(archive, 'r:gz') as ar:
        for item in ar.getmembers():
            if item.isfile():
                parts = Path(item.name).parts
                if parts[0] != 'package': raise ValueError('Unexpected package root')
                save(str(Path(*parts[1:])), ar.extractfile(item).read())
            elif not item.isdir(): raise ValueError('Archive links are not allowed')
else:
    with zipfile.ZipFile(archive) as ar:
        for item in ar.infolist():
            if not item.is_dir(): save(item.filename, ar.read(item))
print('Added:', target)
