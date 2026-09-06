# Rebuild the original, canned Easter-egg illustrations: uv run --with pillow scripts/draw-animals.py
from pathlib import Path
from PIL import Image, ImageDraw
S=3
out=Path(__file__).resolve().parent.parent/'guest/demo-images';out.mkdir(exist_ok=True)
for animal in ['cat','dog','elephant','rabbit','fox','owl']:
 im=Image.new('RGB',(256*S,256*S),'#dcefe6');d=ImageDraw.Draw(im)
 def ellipse(box,fill):d.ellipse(tuple(int(v*S) for v in box),fill=fill)
 def polygon(points,fill):d.polygon([(int(x*S),int(y*S)) for x,y in points],fill=fill)
 def line(points,fill,width=3):d.line([(int(x*S),int(y*S)) for x,y in points],fill=fill,width=width*S,joint='curve')
 ellipse((17,17,239,239),'#f8f4de');ellipse((56,211,202,230),'#b1c9b8')
 coat={'cat':'#e4a15d','dog':'#b97c54','elephant':'#879bb0','rabbit':'#eee5db','fox':'#de7f47','owl':'#998676'}[animal]
 ellipse((72,157,184,227),coat);ellipse((95,178,161,229),'#f5e8d5')
 if animal in ['cat','fox','owl']:
  polygon([(57,101),(62,33),(112,77)],coat);polygon([(146,77),(194,33),(199,103)],coat)
  polygon([(68,81),(69,50),(94,77)],'#e9b5a5');polygon([(163,77),(186,50),(188,82)],'#e9b5a5')
 elif animal=='rabbit':
  ellipse((70,9,110,110),coat);ellipse((145,9,185,110),coat);ellipse((82,24,99,83),'#e7b4b2');ellipse((157,24,174,83),'#e7b4b2')
 elif animal=='dog':
  ellipse((36,63,91,179),'#744e3c');ellipse((165,63,220,179),'#744e3c')
 elif animal=='elephant':
  ellipse((25,67,106,171),coat);ellipse((150,67,231,171),coat);ellipse((40,82,96,153),'#bdadba');ellipse((160,82,216,153),'#bdadba')
 ellipse((57,59,199,192),coat)
 if animal=='fox':
  polygon([(62,121),(128,153),(95,185)],'#fff0d9');polygon([(194,121),(128,153),(161,185)],'#fff0d9')
 if animal=='owl':
  ellipse((63,80,129,151),'#f5e8d5');ellipse((127,80,193,151),'#f5e8d5')
 if animal=='dog':ellipse((73,83,117,129),'#7e503b')
 for x in [98,158]:
  ellipse((x-7,109,x+7,126),'#293e3c');ellipse((x-3,110,x+1,115),'#ffffff')
 ellipse((73,135,95,146),'#e9ada0');ellipse((161,135,183,146),'#e9ada0')
 if animal=='elephant':
  line([(127,141),(127,184),(140,199),(158,192)],coat,25);ellipse((147,180,171,204),coat)
 else:
  polygon([(119,142),(137,142),(128,150)],'#665049' if animal!='owl' else '#e2a447')
  line([(128,150),(128,158),(118,163),(110,158)],'#665049',2);line([(128,158),(137,163),(145,158)],'#665049',2)
 if animal=='cat':
  for y in [141,151]:line([(78,y),(39,y-5)],'#916b50',2);line([(178,y),(217,y-5)],'#916b50',2)
  for x in [112,128,144]:polygon([(x-4,62),(x+4,62),(x,82)],'#b77b48')
 for x,y in [(28,45),(218,203),(226,36)]:
  line([(x-4,y),(x+4,y)],'#a3bfae',2);line([(x,y-4),(x,y+4)],'#a3bfae',2)
 im.resize((256,256),Image.Resampling.LANCZOS).save(out/f'{animal}.png',optimize=True)
