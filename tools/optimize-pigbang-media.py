import json
from pathlib import Path
from PIL import Image
root=Path('assets/pigbang')
m=json.loads(Path('js/data/pigbang-media.json').read_text(encoding='utf-8-sig'))
for p in root.iterdir():
    if p.suffix.lower() not in ['.jpg','.png']: continue
    im=Image.open(p).convert('RGB');im.thumbnail((1280,720))
    dest=p.with_suffix('.webp');im.save(dest,format='WEBP',quality=80,method=6)
    old='/'+p.as_posix();new='/'+dest.as_posix()
    for value in m.values():
        for key in ['image','backdrop']:
            if value.get(key)==old:value[key]=new
    p.unlink()
Path('js/data/pigbang-media.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
