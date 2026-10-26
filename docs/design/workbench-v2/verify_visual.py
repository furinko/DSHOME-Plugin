from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image,ImageChops
import json,hashlib
root=Path(__file__).resolve().parent
names=['workbench-v2-01-daily','workbench-v2-02-layout-editor','workbench-v2-03-switch-preserve']
chat_box=(200,80,664,1008);composer_box=(220,815,644,976)
first=Image.open(root/(names[0]+'.png')).convert('RGB')
rows=[]
for name in names:
 svg=(root/(name+'.svg')).read_bytes();tree=ET.fromstring(svg);image=Image.open(root/(name+'.png')).convert('RGB')
 assert image.size==(1920,1080)
 nodes=list(tree.iter());ids=[n.attrib['id'] for n in nodes if 'id' in n.attrib]
 assert len(ids)==len(set(ids)), 'Duplicate SVG IDs'
 assert not any(n.tag.rsplit('}',1)[-1] in ('script','foreignObject','image') for n in nodes)
 refs=[v for n in nodes for k,v in n.attrib.items() if k.rsplit('}',1)[-1]=='href']
 assert all(v.startswith('#') for v in refs), 'External asset reference'
 text=''.join(tree.itertext())
 for ident in ['DOC-01','WEB-01','TERM-01','FILE-01','dev-17','未发送草稿']:assert ident in text
 chat_equal=ImageChops.difference(first.crop(chat_box),image.crop(chat_box)).getbbox() is None
 composer_equal=ImageChops.difference(first.crop(composer_box),image.crop(composer_box)).getbbox() is None
 assert chat_equal and composer_equal, 'Rendered chat/input changed between states'
 rows.append({'name':name,'size':list(image.size),'editableTextElements':sum(n.tag.endswith('}text') for n in nodes),'svgSha256':hashlib.sha256(svg).hexdigest(),'onlyInternalSymbolRefs':True,'noScriptsOrRasterAssets':True,'renderedChatPixelsIdentical':chat_equal,'renderedComposerPixelsIdentical':composer_equal})
report={'kind':'static SVG/XML plus actual rendered pixel checks; not running DSH or interactive implementation acceptance','chatBox':list(chat_box),'composerBox':list(composer_box),'allPass':True,'files':rows}
(root/'visual-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
