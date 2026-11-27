"""Validate real PNG/PDF exports and render all pages for visual review.
Uses the existing external Pillow/pypdf/Poppler environment; no app dependencies.
"""
import json
import pathlib
import subprocess
import sys
from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader, apply_configuration

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'output/cbmx-actor-repositioning')
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
    metrics = record['metrics']
    clone = metrics['rasterClone']
    assert clone['table']['width'] == metrics['table']['width'], name
    assert clone['maxRight'] + 5 <= w / 2 + .02 and clone['maxBottom'] + 5 <= h / 2 + .02, name
    assert clone['controls'] == 0, name
    pdf = PdfReader(root / (name + '.pdf'))
    assert len(pdf.pages) == 1, name
    page = pdf.pages[0]
    pw, ph = map(float, (page.mediabox.width, page.mediabox.height))
    assert abs(pw - 841.89) < .02 and abs(ph - 595.28) < .02, name
    images = [obj.get_object() for obj in page['/Resources']['/XObject'].values() if obj.get_object()['/Subtype'] == '/Image']
    assert len(images) == 1 and (images[0]['/Width'], images[0]['/Height']) == (w, h), name
    # Verify the PDF embeds the same actual raster pixels, not just its dimensions.
    # Dense ten-actor rasters exceed pypdf's default 75 MB decompression cap.
    # Bound extraction to the dimensions of these locally generated test images.
    raster_limit = max(75_000_000, w * h * 4 + h)
    with apply_configuration(zlib_maximum_output_length=raster_limit, image_maximum_buffer_size=raster_limit):
        embedded = page.images[0].image.convert('RGB')
    assert embedded.size == image.size and ImageChops.difference(embedded, image).getbbox() is None, name
    matrices = [list(map(float, args)) for args, op in page.get_contents().operations if op == b'cm']
    assert len(matrices) == 1, name
    a, b, c, d, x, y = matrices[0]
    assert b == c == 0 and x >= -.001 and y >= -.001 and x+a <= pw+.001 and y+d <= ph+.001, name
    assert abs(a/d-w/h) < .000001, name
    subprocess.run(['pdftoppm', '-scale-to', '1800', '-singlefile', '-png', str(root/(name+'.pdf')), str(root/'pdf-pages'/name)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results.append({'name': name, 'png': [w, h], 'marginsLTRB': margins, 'pdfPages': 1, 'pdfSamePixels': True, 'placement': [a, d, x, y]})
    print('PASS ' + name + ': PNG edges, identical PDF raster, one landscape A4 page', flush=True)

sheet = Image.new('RGB', (1600, 560 * ((len(results) + 3)//4)), '#e5e7eb')
draw = ImageDraw.Draw(sheet)
for i, record in enumerate(results):
    im = Image.open(root/'pdf-pages'/(record['name']+'.png')).convert('RGB')
    im.thumbnail((390, 520))
    left, top = (i % 4)*400, (i//4)*560
    sheet.paste(im, (left, top + 25))
    draw.text((left + 5, top + 5), record['name'], fill='#172b43')
sheet.save(root/'pdf-contact.png')
(root/'artifact-checks.json').write_text(json.dumps(results, indent=2))
print(json.dumps({'pairs': len(results), 'completeEdges': True, 'samePixelsInPdf': True, 'landscapeA4': True}))
