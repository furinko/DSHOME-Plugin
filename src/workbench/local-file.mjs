// User-selected browser capabilities only. No Host path or model tool access.
export function createLocalFileTransport({ file, handle, id = crypto.randomUUID() }) {
  const max = 2 * 1024 * 1024, path = file.name;
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  async function read() {
    const current = handle ? await handle.getFile() : file;
    if (current.size > max) fail('FS_TOO_LARGE', '本机文本文件超过 2 MB，请使用其他编辑器。');
    const bytes = new Uint8Array(await current.arrayBuffer());
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail('FS_ENCODING', '仅支持 UTF-8 文本；未修改原文件。'); }
    if (text.includes('\0')) fail('FS_BINARY', '这个文件不是可编辑文本；未修改原文件。');
    const version = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    return { text, version, absolutePath: path, projectId: 'local:' + id };
  }
  return { read, async save(_path, text, version) {
    if (!handle?.createWritable) fail('FS_READ_ONLY', '当前客户端只能读取这个文件，请使用导出草稿保存副本。');
    if (!text.isWellFormed() || new TextEncoder().encode(text).length > max) fail('FS_INVALID_TEXT', '内容超出大小限制或含无效字符。');
    if (handle.requestPermission && await handle.requestPermission({mode:'readwrite'}) !== 'granted') fail('FS_PERMISSION', '未获得原文件写入许可，草稿仍保留。');
    if ((await read()).version !== version) fail('FS_STALE_VERSION', '原文件已改变，请先比较磁盘。');
    let stream;
    try {
      stream = await handle.createWritable({ mode: 'exclusive' });
      if ((await read()).version !== version) { await stream.abort(); stream = null; fail('FS_STALE_VERSION', '原文件已改变，请先比较磁盘。'); }
      await stream.write(new TextEncoder().encode(text)); await stream.close(); stream = null;
      const result = await read();
      if (result.text !== text) throw Error('保存后内容未匹配，请比较磁盘；草稿仍保留。');
      return result;
    } catch (error) { if (stream) await stream.abort().catch(()=>{}); throw error; }
  } };
}
