import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
function zip(parts) {
  const local=[],central=[];let offset=0;
  for(const [name,text] of Object.entries(parts)){
    const n=Buffer.from(name),data=Buffer.from(text),packed=deflateRawSync(data);let crc=0xffffffff;
    for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const a=Buffer.alloc(30);a.writeUInt32LE(0x04034b50);a.writeUInt16LE(20,4);a.writeUInt16LE(8,8);a.writeUInt32LE(crc,14);a.writeUInt32LE(packed.length,18);a.writeUInt32LE(data.length,22);a.writeUInt16LE(n.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(a,n,packed);central.push(c,n);offset+=a.length+n.length+packed.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,cd,end]);
}
export async function runLocalFormats(page){
  const scene=page.locator('.p0-full-scene:not([hidden])'),input=scene.getByLabel('选择本机文件',{exact:true});
  const preview=scene.getByRole('region',{name:'本机文件预览'});
  const close=async name=>scene.getByRole('button',{name:'关闭标签 '+name,exact:true}).filter({visible:true}).click();
  await page.evaluate(async()=>{
    const v=window.testP0.ctx.get('dualShellP0').getSnapshot();const c=window.testP0.ctx.get('dshomeDesktop').entries.get(v.selected).controller;window.formatsController=c;
    const root=await navigator.storage.getDirectory(),folder=await root.getDirectoryHandle('folder-preview-fixture',{create:true}),sub=await folder.getDirectoryHandle('nested',{create:true}),file=await sub.getFileHandle('nested.txt',{create:true});const w=await file.createWritable();await w.write('文件夹里的正文');await w.close();
    await c.addLocalFolder(folder);await c.addLocalFolder(folder);window.formatsFolder=folder;
  });
  assert.equal(await page.evaluate(()=>window.formatsController.localRoots.size),1);
  await scene.getByRole('button',{name:'展开本机文件夹 nested',exact:true}).click();await scene.getByRole('button',{name:'打开本机文件 nested.txt',exact:true}).click();
  assert.equal(await scene.locator('textarea.wb-editor:visible').inputValue(),'文件夹里的正文');
  await page.screenshot({path:'test-output/local-folder.png'});
  await scene.getByRole('button',{name:'移除本机文件夹 folder-preview-fixture',exact:true}).click();
  assert.equal(await scene.locator('textarea.wb-editor:visible').inputValue(),'文件夹里的正文');await close('nested.txt');
  const fixtures=[
    ['fixture.docx',{'word/document.xml':'<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Word 内容 &lt;script&gt;</w:t></w:r></w:p></w:body></w:document>'},'Word 内容 <script>'],
    ['fixture.xlsx',{'xl/workbook.xml':'<workbook xmlns:r="urn:r"><sheets><sheet name="预算" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="s" Type="type/sharedStrings" Target="sharedStrings.xml"/></Relationships>','xl/sharedStrings.xml':'<sst><si><t>项目名称</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>'},'项目名称'],
    ['fixture.pptx',{'ppt/presentation.xml':'<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="2" r:id="s2"/><p:sldId id="1" r:id="s1"/></p:sldIdLst></p:presentation>','ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="s1" Target="slides/slide1.xml"/><Relationship Id="s2" Target="slides/slide2.xml"/></Relationships>','ppt/slides/slide1.xml':'<slide><p><t>第二张</t></p></slide>','ppt/slides/slide2.xml':'<slide><p><t>第一张按关系排序</t></p></slide>'},'第一张按关系排序']
  ];
  for(const [name,parts,expected] of fixtures){await input.setInputFiles({name,mimeType:'application/octet-stream',buffer:zip(parts)});await preview.waitFor();assert.ok((await preview.innerText()).includes(expected));await close(name);}
  await input.setInputFiles({name:'tiny.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});await preview.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('.wb-local-preview img')?.naturalWidth===1);await close('tiny.gif');
  const wav=Buffer.alloc(44+1600);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
  await input.setInputFiles({name:'silence.wav',mimeType:'audio/wav',buffer:wav});await preview.locator('audio').waitFor();await page.waitForFunction(()=>document.querySelector('.wb-local-preview audio')?.readyState>=1);await close('silence.wav');
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await input.setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:pdf});await preview.locator('object[type="application/pdf"]').waitFor();assert.ok((await preview.locator('object').getAttribute('data')).startsWith('blob:'));await close('sample.pdf');
  await input.setInputFiles({name:'utf16.txt',mimeType:'text/plain',buffer:Buffer.concat([Buffer.from([255,254]),Buffer.from('中文旧编码','utf16le')])});await scene.getByLabel('文本预览编码').selectOption('utf-16le');await page.waitForFunction(()=>document.querySelector('.wb-local-preview pre')?.textContent==='中文旧编码');await close('utf16.txt');
  await page.evaluate(async()=>{const c=window.formatsController;const count=c.contents.size;let failed=false;try{await c.openLocalFile(new File(['not-a-zip'],'broken.docx'));}catch{failed=true;}if(!failed||c.contents.size!==count)throw Error('invalid Office created content');const root=await navigator.storage.getDirectory();await root.removeEntry('folder-preview-fixture',{recursive:true});});
  const before=await scene.boundingBox();await page.getByRole('button',{name:'专注操作区',exact:true}).click();assert.ok((await scene.boundingBox()).width>before.width);await page.getByRole('button',{name:'恢复右侧聊天',exact:true}).click();
  await page.getByRole('button',{name:'工作区与会话',exact:true}).click();await page.getByRole('button',{name:'会话 A',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'工作区与会话',exact:true}).getAttribute('aria-expanded'),'false');
  await page.screenshot({path:'test-output/local-formats-navigation.png'});
  return {folderLazyOpen:true,folderRemoveKeepsDocument:true,officeContentPreview:true,officeEditing:false,imageDecoded:true,wavMetadataLoaded:true,pdfCarrierOnly:true,utf16Readonly:true,focusAndDrawer:true};
}
