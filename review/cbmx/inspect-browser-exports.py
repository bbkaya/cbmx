"""Check generated browser exports with Pillow, pypdf and Poppler (no backend)."""
import json, pathlib, subprocess, sys
from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'output/cbmx-safari-review')
records = [json.loads(line) for line in (root / 'browser-results.jsonl').read_text().splitlines()]
results = []
(root / 'pdf-pages').mkdir(exist_ok=True)
for record in records:
    name = record['name']
    image = Image.open(root / (name + '.png')).convert('RGB')
    w, h = image.size
    bbox = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
    margins = [bbox[0], bbox[1], w - bbox[2], h - bbox[3]]
    assert min(margins) >= 10 and max(margins) <= 18, (name, margins)
    assert max(margins) - min(margins) <= 2, (name, margins)
    metrics = record['metrics']; clone = metrics['rasterClone']
    assert clone['table']['width'] == metrics['table']['width'], name
    assert clone['maxRight'] + 5 <= w / 2 + .02 and clone['maxBottom'] + 5 <= h / 2 + .02, name
    assert clone['controls'] == 0, name
    pdf = PdfReader(root / (name + '.pdf')); assert len(pdf.pages) == 1, name
    page = pdf.pages[0]; pw, ph = map(float, (page.mediabox.width, page.mediabox.height))
    assert abs(pw - 841.89) < .02 and abs(ph - 595.28) < .02, name
    images = [obj.get_object() for obj in page['/Resources']['/XObject'].values() if obj.get_object()['/Subtype'] == '/Image']
    assert len(images) == 1 and (images[0]['/Width'], images[0]['/Height']) == (w, h), name
    matrices = [list(map(float, args)) for args, op in page.get_contents().operations if op == b'cm']
    assert len(matrices) == 1, name
    a,b,c,d,x,y = matrices[0]
    assert b == c == 0 and x >= -.001 and y >= -.001 and x+a <= pw+.001 and y+d <= ph+.001, name
    assert abs(a/d-w/h) < .000001, name
    subprocess.run(['pdftoppm','-scale-to','1800','-singlefile','-png',str(root/(name+'.pdf')),str(root/'pdf-pages'/name)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    results.append({'name':name,'png':[w,h],'whiteMarginsPixelsLTRB':margins,'pdfPages':1,'placement':[a,d,x,y]})
(root/'artifact-checks.json').write_text(json.dumps(results,indent=2))
for engine in sorted({r['engine'] for r in records}):
    sheet=Image.new('RGB',(2160,1260),'#e5e7eb');draw=ImageDraw.Draw(sheet)
    for row,density in enumerate(['empty','sparse','dense']):
        for col,count in enumerate(range(2,11)):
            name=f'{engine}-{count}-{density}';im=Image.open(root/'pdf-pages'/(name+'.png')).convert('RGB');im.thumbnail((232,390));sheet.paste(im,(col*240,row*420+26));draw.text((col*240+5,row*420+5),f'{count} / {density}',fill='#172b43')
    sheet.save(root/(engine+'-pdf-contact.png'))
print(json.dumps({'pairs':len(results),'allEdgesComplete':True,'whiteMarginsPixels':sorted({tuple(r['whiteMarginsPixelsLTRB']) for r in results})}))
