"""Inspect locally captured PNG/PDF artefacts; requires Pillow, pypdf and Poppler."""
import json, subprocess, pathlib, sys
from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader
root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[2] / 'output/cbmx-export-edges-review'
(root / 'pdf-pages').mkdir(parents=True, exist_ok=True)
records=json.loads((root/'verification.json').read_text()); results=[]
for rec in records:
 name=rec['name']; im=Image.open(root/(name+'.png')).convert('RGB'); w,h=im.size
 bbox=ImageChops.difference(im,Image.new('RGB',im.size,'white')).getbbox()
 assert bbox and bbox[2]<w and bbox[3]<h,(name,bbox,w,h)
 clone=rec['metrics']['rasterClone']; assert clone['maxRight']<=w/2 and clone['maxBottom']<=h/2 and clone['controls']==0,name
 assert rec['sourceUnchanged'],name
 reader=PdfReader(root/(name+'.pdf')); assert len(reader.pages)==1
 page=reader.pages[0]; pw,ph=map(float,(page.mediabox.width,page.mediabox.height))
 assert abs(pw-841.89)<.02 and abs(ph-595.28)<.02
 xobjects=[v.get_object() for v in page['/Resources']['/XObject'].values()]; images=[v for v in xobjects if v['/Subtype']=='/Image']; assert len(images)==1
 assert (images[0]['/Width'],images[0]['/Height'])==(w,h)
 matrices=[list(map(float,args)) for args,op in page.get_contents().operations if op==b'cm']; assert len(matrices)==1
 a,b,c,d,x,y=matrices[0]; assert b==c==0 and x>=-.001 and y>=-.001 and a+x<=pw+.001 and d+y<=ph+.001
 assert abs(a/d-w/h)<.000001
 subprocess.run(['pdftoppm','-scale-to','1800','-singlefile','-png',str(root/(name+'.pdf')),str(root/'pdf-pages'/name)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if 'readonly' in name:
  baseline=Image.open(root/(name.split('-dense')[0]+'-dense.png')).convert('RGB'); assert baseline.size==im.size and ImageChops.difference(baseline,im).getbbox() is None,name
 results.append({'name':name,'png':[w,h],'inkBounds':bbox,'blankRightPx':w-bbox[2],'blankBottomPx':h-bbox[3],'cloneRightClearanceCssPx':w/2-clone['maxRight'],'cloneBottomClearanceCssPx':h/2-clone['maxBottom'],'pdfPages':1,'pdfImagePlacement':[a,d,x,y]})
(root/'artifact-checks.json').write_text(json.dumps(results,indent=2))
# Contact sheets are derived from the actual output files, not editor screenshots.
for kind in ['png','pdf']:
 sheet=Image.new('RGB',(9*240,3*420),'#e5e7eb');draw=ImageDraw.Draw(sheet)
 for row,density in enumerate(['empty','sparse','dense']):
  for col,n in enumerate(range(2,11)):
   name=f'{n}-{density}'; path=root/(name+'.png') if kind=='png' else root/'pdf-pages'/(name+'.png')
   thumb=Image.open(path).convert('RGB');thumb.thumbnail((232,390)); x=col*240+(240-thumb.width)//2;y=row*420+26
   sheet.paste(thumb,(x,y));draw.text((col*240+8,row*420+5),name,fill='#172b43')
 sheet.save(root/(kind+'-all-counts.png'))
# Native PNG detail pairs: last Benefits column + bottom scenario, four representative counts.
sheet=Image.new('RGB',(4*540,950),'#e5e7eb');draw=ImageDraw.Draw(sheet)
for col,n in enumerate([5,6,7,10]):
 name=f'{n}-sparse';im=Image.open(root/(name+'.png')).convert('RGB'); rec=next(r for r in records if r['name']==name);m=rec['metrics']['rasterClone'];w,h=im.size
 # retain full right edge, complete financial Benefits text and rounded block
 r=m['lastBenefit'];box=(max(0,int(r['left']*2)-12),int(2*r['bottom']-2*r['height'])-12,w,int(r['bottom']*2)+12)
 crop=im.crop(box);crop.thumbnail((510,750));sheet.paste(crop,(col*540+14,40))
 bottom=im.crop((max(0,w-500),h-140,w,h));sheet.paste(bottom,(col*540+14,800))
 draw.text((col*540+14,12),f'{n} actors: full Benefits and bottom-right scenario edge',fill='#172b43')
sheet.save(root/'right-and-bottom-edges.png')
print(json.dumps({'pairs':len(results),'allComplete':True,'rightBlankPxRange':[min(r['blankRightPx'] for r in results),max(r['blankRightPx'] for r in results)],'bottomBlankPxRange':[min(r['blankBottomPx'] for r in results),max(r['blankBottomPx'] for r in results)]}))
