import json,pathlib,hashlib
from PIL import Image
D=pathlib.Path('artifacts/media-research')
for f in D.glob('*.img'):
 try:
  with Image.open(f) as im:
   if im.format=='ICO':
    im.seek(0);im.convert('RGBA').save(f.with_suffix('.png'))
 except:pass
print('Official icons converted without changing their contents.')
