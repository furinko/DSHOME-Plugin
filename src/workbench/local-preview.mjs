import {officePreview} from './office-preview.mjs';
const formats={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],gif:['image','image/gif'],webp:['image','image/webp'],bmp:['image','image/bmp'],ico:['image','image/x-icon'],avif:['image','image/avif'],svg:['image','image/svg+xml'],pdf:['pdf','application/pdf'],mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],ogg:['audio','audio/ogg'],flac:['audio','audio/flac'],m4a:['audio','audio/mp4'],mp4:['video','video/mp4'],webm:['video','video/webm'],mov:['video','video/quicktime']};
export function localFormat(name) {const ext=name.split('.').at(-1).toLowerCase();return formats[ext]?.[0] ?? (['docx','xlsx','pptx'].includes(ext)?'office':['doc','xls','ppt','zip','rar','7z','exe','dll'].includes(ext)?'unsupported':'text');}
export async function preparePreview(file) {
  const kind=localFormat(file.name);
  if(kind==='unsupported') return {kind,file,message:'此格式暂不支持内置预览，请在本机对应应用中打开。旧版 Office 请先另存为 docx / xlsx / pptx。'};
  if(file.size>100*1024*1024) throw Error('预览文件超过 100 MB，请在本机应用中打开。');
  if(kind==='office') return {kind,file,sections:await officePreview(file)};
  const mime=formats[file.name.split('.').at(-1).toLowerCase()]?.[1];
  return {kind,file,blob:new Blob([file],{type:mime})};
}
