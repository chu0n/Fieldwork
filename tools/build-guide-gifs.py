"""Encode GIF tutorials from real UI captures made through the browser tool.
No widgets are redrawn. Only crop, framing, pointer motion and transitions are added.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json,base64,hashlib
ROOT=Path(__file__).resolve().parents[1]
CAP=ROOT/'assets/guide-captures';OUT=ROOT/'assets/guides';OUT.mkdir(parents=True,exist_ok=True)
W,H,FPS=720,420,25
FONT=Path('C:/Windows/Fonts/segoeuib.ttf')
font=ImageFont.truetype(str(FONT),20)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',13)
flows=json.loads((CAP/'captures.json').read_text('utf-8'))
order=['fields','ai','data','mapping','format','json']
clicks={'fields':[True,False,True,False],'ai':[True,False,True],'data':[True,True,True],'mapping':[True,False,True],'format':[True,True,False,True,False],'json':[False,False,True,True]}
ui_files=['src/workbench.js','src/fill-workspace.js','src/main.js','src/style.css','src/workspace.css','src/layout.css','src/bulk.css','src/selection-fields.js','src/quick-walkthrough.js']
ui_hash=hashlib.sha256(''.join((ROOT/file).read_text('utf-8') for file in ui_files).encode('utf-8')).hexdigest()
def ease(v):
 v=max(0,min(1,v));return v*v*(3-2*v)
def pointer(im,x,y,pulse):
 d=ImageDraw.Draw(im)
 if pulse>0:
  r=8+19*pulse;d.ellipse((x-r,y-r,x+r,y+r),outline='#7c3aed',width=2)
 points=[(x,y),(x+2,y+23),(x+8,y+17),(x+14,y+27),(x+18,y+24),(x+12,y+14),(x+22,y+13)]
 d.polygon(points,fill='#273044');d.line(points+[points[0]],fill='white',width=1)
assets={};manifest={}
for key in order:
 steps=flows[key];frames=[];last=None
 for index,step in enumerate(steps):
  raw=Image.open(CAP/step['file']).convert('RGB');crop=step['crop']
  assert 0<=crop[0]<crop[2]<=raw.width and 0<=crop[1]<crop[3]<=raw.height
  shot=raw.crop(crop);scale=min(1.6,648/shot.width,270/shot.height)
  shot=shot.resize((round(shot.width*scale),round(shot.height*scale)),Image.Resampling.LANCZOS)
  left=(W-shot.width)//2;top=101+(270-shot.height)//2
  base=Image.new('RGB',(W,H),'#f2f4f8');d=ImageDraw.Draw(base)
  d.rounded_rectangle((16,16,W-16,H-16),radius=6,fill='white',outline='#dfe2eb')
  # Captions explain the actual action; the UI pixels below remain untouched.
  title=step['title'];size=20
  while d.textlength(title,font=font)>635:
   size-=1;font=ImageFont.truetype(str(FONT),size)
  d.text((35,32),title,font=font,fill='#253044');font=ImageFont.truetype(str(FONT),20)
  d.text((35,65),f'{index+1}/{len(steps)}  ·  Giao diện thực tế',font=small,fill='#747d90')
  base.paste(shot,(left,top));d.rounded_rectangle((left-2,top-2,left+shot.width+1,top+shot.height+1),radius=2,outline='#dfe2eb')
  target=(left+step['target'][0]*scale,top+step['target'][1]*scale)
  for frame in range(FPS*3):
   local=frame/FPS;im=base.copy();move=ease(local/.8)
   x=W-48+(target[0]-(W-48))*move;y=H-60+(target[1]-(H-60))*move
   pulse=(local-1.0)/.45 if clicks[key][index] and 1<local<1.45 else 0
   pointer(im,x,y,pulse)
   if index and local<.24:im=Image.blend(last,im,ease(local/.24))
   frames.append(im)
  last=frames[-1]
 sheet=Image.new('RGB',(W*len(steps),H))
 for i in range(len(steps)):sheet.paste(frames[i*75+45],(i*W,0))
 palette=sheet.quantize(colors=192,method=Image.Quantize.MEDIANCUT)
 indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 gif=OUT/(key+'.gif');indexed[0].save(gif,save_all=True,append_images=indexed[1:],duration=40,loop=0,optimize=True,disposal=1)
 poster=OUT/(key+'-poster.png');frames[24].save(poster,optimize=True)
 check=Image.open(gif);duration=0
 for i in range(check.n_frames):check.seek(i);duration+=check.info.get('duration',0)
 assert duration==len(steps)*3000 and check.n_frames>=60
 assets[key]={'gif':'data:image/gif;base64,'+base64.b64encode(gif.read_bytes()).decode(),'poster':'data:image/png;base64,'+base64.b64encode(poster.read_bytes()).decode(),'duration':duration//1000}
 manifest[key]={'width':W,'height':H,'frames':check.n_frames,'duration_ms':duration,'bytes':gif.stat().st_size,'source':'real-ui-capture','captures':[step['file']for step in steps],'ui_hash':ui_hash}
 print(key,manifest[key]['bytes'],duration,flush=True)
manifest['_ui_files']=ui_files
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'src/guide-assets.js').write_text('// Generated from real browser UI captures by tools/build-guide-gifs.py.\nexport const guideAssets='+json.dumps(assets,separators=(',',':'))+';\n',encoding='utf-8')
