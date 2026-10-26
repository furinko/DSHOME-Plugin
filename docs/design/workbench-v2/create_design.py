from pathlib import Path
from html import escape
from contextlib import contextmanager
import xml.etree.ElementTree as ET
import json

OUT=Path(__file__).resolve().parent
C=dict(bg='#eef2f6',ink='#203047',muted='#65758b',line='#dce4ee',blue='#4769de',pale='#edf2ff',green='#16785f',greenbg='#eaf6f0',amber='#98600d',amberbg='#fff4dd')
ICONS={
 'grid':'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="13" y="3" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><rect x="13" y="13" width="6" height="6" rx="1"/>',
 'file':'<path d="M6 2h8l5 5v13H6Z"/><path d="M14 2v6h5M9 12h7M9 16h5"/>',
 'folder':'<path d="M3 6h6l2 2h9v11H3Z"/><path d="M3 10h17"/>',
 'chat':'<path d="M19 14a3 3 0 0 1-3 3H9l-5 3v-6a7 7 0 1 1 15 0Z"/>',
 'web':'<circle cx="11" cy="11" r="8"/><path d="M3 11h16M11 3c-5 5-5 11 0 16 5-5 5-11 0-16Z"/>',
 'term':'<rect x="2" y="3" width="18" height="16" rx="3"/><path d="m6 8 3 3-3 3m6 1h4"/>',
 'plus':'<path d="M11 4v14M4 11h14"/>',
 'down':'<path d="m5 8 6 6 6-6"/>',
 'close':'<path d="m6 6 10 10M16 6 6 16"/>',
 'expand':'<path d="M8 3H3v5m11-5h5v5M3 14v5h5m11-5v5h-5"/>',
 'split':'<rect x="2" y="3" width="18" height="16" rx="2"/><path d="M11 3v16"/>',
 'swap':'<path d="M3 7h15m-4-4 4 4-4 4M19 16H4m4-4-4 4 4 4"/>',
 'search':'<circle cx="9" cy="9" r="6"/><path d="m14 14 5 5"/>',
 'arrow':'<path d="M11 18V4m-5 6 5-6 5 6"/>',
 'check':'<path d="m5 11 4 4 8-9"/>',
 'lock':'<rect x="5" y="9" width="12" height="11" rx="2"/><path d="M7 9V6a4 4 0 0 1 8 0v3"/>',
 'settings':'<path d="M4 6h14M4 16h14"/><circle cx="8" cy="6" r="2"/><circle cx="14" cy="16" r="2"/>',
 'clock':'<circle cx="11" cy="11" r="8"/><path d="M11 6v5l3 2"/>',
}
class SVG:
 def __init__(self,title,description):
  self.a=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-labelledby="title description"><title id="title">{escape(title)}</title><desc id="description">{escape(description)}</desc><defs>']
  for name,body in ICONS.items():self.a.append(f'<symbol id="i-{name}" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{body}</symbol>')
  self.a.append('</defs><style>text{font-family:"Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif}.mono{font-family:Consolas,monospace}</style>')
 def add(self,v):self.a.append(v)
 @contextmanager
 def group(self,name,box=None,extra=''):
  self.add(f'<g id="{name}"'+(f' data-box="{box[0]},{box[1]},{box[2]},{box[3]}"' if box else '')+f' {extra}>');yield;self.add('</g>')
 def rect(self,x,y,w,h,fill='#fff',r=8,stroke=None,extra=''):
  self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+f' {extra}/>')
 def text(self,x,y,t,size=14,color=None,weight=400,anchor='start',extra=''):
  self.add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color or C["ink"]}" text-anchor="{anchor}" {extra}>{escape(t)}</text>')
 def line(self,x,y,x2,y2,color=None,width=1,extra=''):
  self.add(f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{color or C["line"]}" stroke-width="{width}" {extra}/>')
 def icon(self,k,x,y,size=20,color=None):self.add(f'<use href="#i-{k}" x="{x}" y="{y}" width="{size}" height="{size}" color="{color or C["muted"]}"/>')
 def dot(self,x,y,color,r=3):self.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
 def chip(self,x,y,w,t,fill=None,color=None,h=27,size=12):
  self.rect(x,y,w,h,fill or C['pale'],6);self.text(x+w/2,y+h/2+4.5,t,size,color or C['blue'],500,'middle')
 def button(self,x,y,w,t,primary=False,icon=None,h=36):
  self.rect(x,y,w,h,C['blue'] if primary else '#fff',7,None if primary else C['line'])
  if icon:self.icon(icon,x+11,y+(h-18)/2,18,'#fff' if primary else C['muted'])
  self.text(x+(36 if icon else w/2),y+h/2+5,t,14,'#fff' if primary else C['ink'],500,'start' if icon else 'middle')
 def panel(self,x,y,w,h,title,kind,instance,active=False):
  self.rect(x,y,w,h,'#fff',9,C['blue'] if active else C['line']);self.icon(kind,x+13,y+13,18)
  self.text(x+40,y+27,title,15,weight=600);self.text(x+105,y+27,instance,12,C['muted'],extra='class="mono"')
  if w>=300:
   for a in [0,4]:
    for b in [0,4,8]:self.dot(x+w-88+a,y+17+b,'#a8b6c8',1)
  self.icon('expand',x+w-59,y+14,16);self.icon('close',x+w-29,y+14,16);self.line(x,y+44,x+w,y+44)
 def save(self,name):
  self.add('</svg>');target=OUT/name;target.write_text('\n'.join(self.a),encoding='utf8');ET.parse(target);return target

def shell(s,number,label):
 s.rect(0,0,1920,1080,C['bg'],0)
 s.rect(0,0,1920,64,'#fff',0);s.icon('grid',23,22,24,C['blue']);s.text(60,40,'DSHOME',23,weight=700)
 s.text(205,39,'工作空间 / 布局与内容分离',15,C['muted']);s.chip(1590,19,184,'SVG 02 · 交互概念',h=28)
 s.text(1887,39,'1920 × 1080',13,C['muted'],anchor='end');s.line(0,64,1920,64)
 with s.group('navigation',(0,64,184,960)):
  s.text(20,109,'项目',15,weight=650);s.icon('plus',143,92,18)
  s.rect(12,132,160,45,'#dfe8ff',8);s.icon('folder',24,146,17,C['blue']);s.text(50,161,'工作台设计',14,C['blue'],600)
  for yy,t,ic in [(206,'文档审阅','file'),(251,'网页资料','web'),(296,'终端任务','term')]:s.icon(ic,24,yy-16,18);s.text(51,yy,t,14)
  s.line(20,334,164,334);s.text(20,369,'示例项目',12,C['muted']);s.text(20,397,'repos',14,weight=600);s.text(20,428,'每个项目独立布局',12,C['muted'])
  s.rect(16,478,152,112,'#e6ebf3',9);s.text(29,507,'内容先于工具入口',13,weight=600)
  s.text(29,537,'文件 / 网页 / 终端',12,C['muted']);s.text(29,562,'可以同时工作。',12,C['muted'])
  s.icon('settings',24,960,19);s.text(53,976,'本地工作区',13,C['muted'])
 with s.group('chat',(200,80,464,928)):
  s.rect(200,80,464,928,'#fff',12,C['line']);s.icon('chat',220,101,21,C['blue']);s.text(252,119,'工作台设计',18,weight=650);s.chip(542,98,100,'独立对话区')
  s.line(200,143,664,143);s.text(223,174,'当前会话',13,C['blue'],600);s.text(310,174,'上下文',13,C['muted']);s.line(222,188,276,188,C['blue'],2)
  s.rect(262,214,378,84,C['pale'],10);s.text(280,244,'先对照方案，别打断正在跑的终端。',15);s.text(280,271,'文档草稿也先保留。',15)
  s.rect(222,331,28,28,'#e5ecff',9);s.text(236,351,'鲸',15,C['blue'],600,'middle');s.text(261,352,'DeepSeek 娘',14,weight=600)
  s.text(222,399,'只切换布局，不关闭内容。',20,weight=650);s.text(222,435,'你可以直接调整面板；复杂修改再交给我。',14,C['muted'])
  s.rect(222,465,420,112,'#f7f9fc',9,C['line']);s.icon('file',239,483,19,C['blue']);s.text(269,499,'引用：交互说明.md · 第18段',14,weight=600)
  s.text(240,531,'切换布局，只移动和收起现有面板。',14,C['muted']);s.text(240,557,'定位到文档面板 →',13,C['blue'],600)
  s.text(222,619,'本轮已关联',12,C['muted']);s.chip(222,636,138,'文档选区');s.chip(370,636,128,'当前网页');s.chip(508,636,134,'终端状态')
  s.text(222,712,'选择内容，再引用到对话。',14,C['muted']);s.text(222,738,'布局编辑不改变聊天位置，也不清空输入。',13,C['muted'])
  with s.group('composer',(220,815,424,161)):
   s.rect(220,815,424,161,'#fff',11,'#c8d4e6');s.chip(234,828,105,'未发送草稿',C['amberbg'],C['amber']);s.text(234,883,'对比两个布局，先保留当前草稿。',15)
   s.icon('plus',235,935,19);s.icon('lock',268,935,18);s.text(294,950,'当前会话',12,C['muted']);s.rect(593,927,34,34,C['blue'],17);s.icon('arrow',600,934,20,'#fff')
  s.dot(224,991,C['green'],3);s.text(236,996,'输入框始终可见 · 切换不发送草稿',12,C['muted'])
 s.rect(680,80,1224,928,'#f7f9fc',12,C['line'])
 s.line(16,1024,1904,1024);s.text(24,1056,f'{number} / {label}',16,weight=650)
 s.text(1896,1056,'设计示意 · 所有内容为模拟 · 非运行截图 / 非已实现能力',13,C['muted'],anchor='end')

def workspace_header(s,mode):
 s.rect(681,81,1222,63,'#fff',11);s.rect(681,120,1222,24,'#fff',0);s.text(701,117,'操作区' if mode!='edit' else '布局编辑',20,weight=650)
 s.text(802,117,'repos · 工作台设计',13,C['muted'])
 if mode=='edit':
  s.chip(1154,100,158,'更改尚未应用',C['amberbg'],C['amber']);s.button(1624,96,94,'取消');s.button(1730,96,154,'应用布局',True)
 else:
  s.button(1334,96,154,'布局：'+('开发' if mode=='daily' else '审阅')+' ▾');s.button(1498,96,116,'编辑布局');s.button(1624,96,130,'添加模块',icon='plus');s.button(1764,96,120,'项目设置')
 s.line(680,144,1904,144)
 if mode=='edit':
  s.chip(699,156,102,'编辑模式');s.text(817,175,'只修改右侧布局，不改文件、不运行命令。',14,C['muted']);s.text(1884,175,'终端 dev-17 持续运行',13,C['green'],anchor='end')
 else:
  for xx,t in [(699,'开发'),(783,'审阅'),(867,'对照')]:
   if t==('开发' if mode=='daily' else '审阅'):s.chip(xx,155,70,t,size=14,h=30)
   else:s.text(xx+35,176,t,14,C['muted'],500,'middle')
  s.text(961,176,'4 个面板 · 6 项打开内容',13,C['muted']);s.text(1884,176,'拖动分隔线调整大小' if mode=='daily' else '已切换布局 · 内容未重建',13,C['green'] if mode!='daily' else C['muted'],anchor='end')

def file_panel(s):
 x,y,w,h=696,208,222,728
 with s.group('file-panel',(x,y,w,h),'data-instance="FILE-01"'):
  s.panel(x,y,w,h,'文件','folder','FILE-01');s.rect(x+12,y+58,w-24,32,'#f2f5fa',6);s.icon('search',x+21,y+65,17);s.text(x+45,y+80,'查找项目文件',13,C['muted'])
  rows=[(y+124,0,'design-workbench','folder'),(y+164,12,'docs','folder'),(y+204,26,'交互说明.md','file'),(y+244,26,'布局草图.svg','file'),(y+294,12,'src','folder'),(y+334,26,'workspace.ts','file'),(y+374,26,'modules','folder'),(y+424,12,'package.json','file')]
  for yy,indent,t,ic in rows:
   if t=='交互说明.md':s.rect(x+8,yy-25,w-16,35,C['pale'],6)
   s.icon(ic,x+14+indent,yy-19,17,C['blue'] if t=='交互说明.md' else C['muted']);s.text(x+39+indent,yy-5,t,13,C['blue'] if t=='交互说明.md' else C['ink'])
  s.line(x+15,y+553,x+w-15,y+553);s.text(x+16,y+585,'当前选择',12,C['muted']);s.text(x+16,y+614,'docs / 交互说明.md',13,weight=500)
  s.button(x+14,y+641,w-28,'打开到文档面板',icon='file');s.text(x+16,y+704,'选择与展开状态随布局保留',12,C['muted'])

def document(s,x,y,w,h,review=False):
 with s.group('document-panel',(x,y,w,h),'data-instance="DOC-01"'):
  s.panel(x,y,w,h,'文档','file','DOC-01',True)
  s.rect(x+10,y+49,190,32,C['pale'],5);s.text(x+24,y+71,'交互说明.md',14,C['blue'],600);s.dot(x+181,y+64,C['amber'],3)
  s.text(x+216,y+71,'布局草图.svg',13,C['muted']);s.line(x,y+86,x+w,y+86)
  s.chip(x+16,y+94,62,'预览',h=27);s.text(x+110,y+113,'编辑',13,C['muted'],'500','middle');s.chip(x+157,y+94,121,'草稿尚未保存',C['amberbg'],C['amber'])
  s.button(x+w-118,y+91,103,'保存文件',h=32)
  s.text(x+24,y+166,'模块交互规范',26,weight=650);s.text(x+24,y+197,'布局是一种排布方式；内容有自己的生命周期。',14,C['muted'])
  s.button(x+w-196,y+136,172,'引用选区到对话',h=34)
  s.rect(x+24,y+219,w-48,102,C['pale'],8);s.text(x+42,y+247,'当前选区 · 第18段',13,C['blue'],600)
  s.text(x+42,y+278,'切换布局，只移动和收起现有面板。',16);s.text(x+42,y+304,'同一份草稿、网页位置和终端会话继续保留。',14,C['muted'])
  s.text(x+24,y+357,'布局保存与文档保存分开处理。',15,weight=500)
  if review:
   s.line(x+24,y+385,x+w-24,y+385);s.text(x+24,y+425,'04 / 内容不等于布局',22,weight=650)
   s.text(x+24,y+462,'关闭一个可见区域，不应默默终止正在运行的任务。',14,C['muted'])
   s.text(x+24,y+490,'结束终端进程，需要独立的确认动作。',14,C['muted'])
   s.rect(x+24,y+524,w-48,57,'#f6f8fb',8);s.text(x+40,y+558,'DOC-01 · 仍是切换前的文档实例',14,C['blue'],500)
  else:s.text(x+24,y+384,'按内容选区引用，不需要把整份文档搬进聊天。',13,C['muted'])
  s.rect(x+w-11,y+137,4,h-167,'#edf0f5',2);s.rect(x+w-11,y+183,4,64,'#becbe0',2)
  s.text(x+w-25,y+h-15,'停留在第18段 · 草稿未清空',12,C['muted'],anchor='end')

def terminal(s):
 x,y,w,h=932,640,558,296
 with s.group('terminal-panel',(x,y,w,h),'data-instance="TERM-01"'):
  s.panel(x,y,w,h,'终端','term','TERM-01');s.rect(x+1,y+45,w-2,h-46,'#182433',0)
  s.chip(x+12,y+55,104,'dev-17',fill='#31435c',color='#e1e9f5',h=27);s.text(x+135,y+75,'scratch-03',12,'#9aaec8',extra='class="mono"')
  s.dot(x+w-97,y+68,'#6ed7b0',3);s.text(x+w-21,y+73,'运行中',12,'#a4e9d0',anchor='end')
  for yy,t,c in [(y+119,'$ npm run dev','#dce6f4'),(y+152,'watching · ready for changes','#96acc9'),(y+185,'process remains attached to dev-17','#96acc9')]:s.text(x+18,yy,t,14,c,extra='class="mono"')
  s.line(x+16,y+218,x+w-16,y+218,'#344255');s.text(x+18,y+249,'切布局不重启进程',14,'#d3dfef');s.text(x+18,y+277,'示例终端输出 · 非实际命令执行',12,'#9fb0c6')

def browser(s,x,y,w,h,review=False):
 with s.group('browser-panel',(x,y,w,h),'data-instance="WEB-01"'):
  s.panel(x,y,w,h,'网页','web','WEB-01');s.rect(x+12,y+55,w-24,30,'#f2f5fa',6);s.icon('lock',x+20,y+62,16);s.text(x+44,y+75,'docs.example.test/workspace',12,C['muted'])
  s.text(x+22,y+128,'布局参考',22,weight=650);s.text(x+22,y+158,'同一个网页，保留阅读位置。',14,C['muted'])
  bw=(w-58)/2;s.rect(x+22,y+180,bw,66,C['pale'],7);s.rect(x+36+bw,y+180,bw,66,'#f1f5f8',7)
  s.text(x+22+bw/2,y+218,'内容容器',14,C['blue'],600,'middle');s.text(x+36+bw+bw/2,y+218,'可替换布局',14,C['muted'],500,'middle')
  if review:
   s.line(x+22,y+277,x+w-22,y+277);s.text(x+22,y+314,'阅读记录',15,weight=600)
   for i,t in enumerate(['面板标识：WEB-01','当前锚点：内容与布局分离','位置保持：页面 42%','未重新导航 / 未自动操作']):s.text(x+22,y+351+i*34,t,13,C['muted'])
   s.rect(x+22,y+514,w-44,56,C['greenbg'],8);s.icon('check',x+35,y+531,18,C['green']);s.text(x+64,y+550,'内容实例没有被重新创建',14,C['green'],500)
  s.rect(x+w-11,y+100,4,h-128,'#edf0f5',2);s.rect(x+w-11,y+150,4,50,'#bfcbdd',2)
  s.text(x+22,y+h-17,'阅读位置 42% · WEB-01',12,C['muted'])

def status(s,kind):
 with s.group('workspace-status',(696,950,1192,40)):
  s.rect(696,950,1192,40,C['greenbg'] if kind=='review' else '#edf1f7',7)
  if kind=='edit':s.text(711,976,'布局草稿 · 尚未应用 · 4 个现有实例继续保留',13,C['muted']);s.text(1872,976,'撤销 Ctrl+Z',13,C['blue'],anchor='end')
  else:s.icon('check',710,960,18,C['green']);s.text(738,976,'布局已保存  |  文档草稿尚未保存  |  终端进程持续运行',13,C['green']);s.text(1872,976,'项目级布局 · 不跨项目混用',12,C['muted'],anchor='end')

def daily():
 s=SVG('模块化工作台 V2 · 日常组合','可编辑SVG概念稿。文件树、文档、终端和网页同时工作；聊天与输入框独立。未实现能力不作运行宣称。')
 shell(s,'01','日常布局：四个真实内容面板，共同完成任务')
 with s.group('workspace',(680,80,1224,928)):
  workspace_header(s,'daily');file_panel(s);document(s,932,208,956,410);terminal(s);browser(s,1506,640,382,296)
  s.rect(923,220,5,704,'#d4ddec',2);s.rect(923,526,5,54,'#8ea6e8',2);s.line(941,629,1878,629,'#c6d3e8',3);s.rect(1368,626,54,6,'#8ea6e8',3);s.line(1498,650,1498,925,'#d0dbeb',3);status(s,'daily')
 return s.save('workbench-v2-01-daily.svg')

def mini(s,x,y,w,h,title,ident,fill='#f0f4fa',selected=False):
 s.rect(x,y,w,h,fill,6,C['blue'] if selected else '#ccd8e9',extra='stroke-width="2"' if selected else '')
 s.text(x+12,y+26,title,14,C['blue'] if selected else C['ink'],600);s.text(x+12,y+49,ident,12,C['muted'],extra='class="mono"')

def editor():
 s=SVG('模块化工作台 V2 · 布局编辑','可编辑SVG概念稿。模块库、停靠预览、属性及应用取消全部在工作区内；原有聊天和输入框保持不动。')
 shell(s,'02','布局编辑：添加的是内容模块，不是工具栏按钮')
 with s.group('workspace',(680,80,1224,928)):
  workspace_header(s,'edit')
  with s.group('module-library',(696,208,252,728)):
   s.rect(696,208,252,728,'#fff',9,C['line']);s.text(714,241,'模块库',17,weight=650);s.text(714,270,'拖入有效区域，或点添加。',13,C['muted'])
   for i,(title,desc,ic) in enumerate([('文件树','浏览并选择项目文件','folder'),('文档','编辑 / 预览 / 引用选区','file'),('终端','运行会话与命令输出','term'),('网页','可有多个独立网页实例','web'),('应用容器','嵌入项目自己的小应用','grid')]):
    yy=294+i*88;s.rect(710,yy,224,74,'#f8fafd',8,C['line']);s.icon(ic,723,yy+16,20,C['blue']);s.text(756,yy+31,title,15,weight=600);s.text(723,yy+58,desc,12,C['muted']);s.icon('plus',905,yy+17,17)
   s.line(713,755,931,755);s.text(714,785,'已有内容不会因编辑而关闭',13,C['green'],500)
   s.text(714,822,'可复用已有实例，',13,C['muted']);s.text(714,848,'也可新建同类型模块。',13,C['muted']);s.chip(714,880,214,'例如：WEB-01 与 WEB-02 并存',h=30)
  with s.group('layout-canvas',(960,208,604,728)):
   s.rect(960,208,604,728,'#fff',9,C['line']);s.text(978,241,'布局草稿',17,weight=650);s.text(1545,241,'开发 → 审阅（草稿）',13,C['muted'],anchor='end')
   s.text(978,274,'按比例缩小的布局示意；蓝色为有效目标。',13,C['muted'])
   s.rect(978,295,40,350,'#e9eff9',6,'#ccd8e9');s.icon('folder',987,313,21,C['blue'])
   mini(s,1030,295,298,286,'文档','DOC-01')
   s.rect(1340,295,202,286,'#e8efff',6,C['blue'],extra='stroke-dasharray="6 4" stroke-width="2"');s.icon('swap',1427,337,28,C['blue']);s.text(1441,407,'移到文档右侧',16,C['blue'],600,'middle');s.text(1441,445,'WEB-01',13,C['blue'],'500','middle',extra='class="mono"');s.text(1441,478,'复用现有网页实例',12,C['muted'],anchor='middle')
   mini(s,1030,593,512,52,'终端收起 · dev-17 持续运行','TERM-01')
   s.text(978,666,'FILE-01 收起，文件选择不变。',12,C['muted'])
   s.text(978,688,'目标位置明确，不是任意像素摆放。',14,weight=500)
   for xx,yy,w,t,ic in [(978,710,268,'左右分割','split'),(1258,710,286,'上下分割','split'),(978,756,268,'交换位置','swap'),(1258,756,286,'合并为标签组','grid')]:s.button(xx,yy,w,t,icon=ic)
   s.rect(978,822,566,87,'#f5f7fb',8);s.text(994,849,'空间不足时先检查最小宽度，不强行挤小内容。',13,C['muted']);s.text(994,877,'此处表达交互规则，不代表已实现通用停靠引擎。',12,C['muted'])
  with s.group('module-properties',(1576,208,312,728)):
   s.rect(1576,208,312,728,'#fff',9,C['line']);s.text(1594,241,'模块属性',17,weight=650);s.chip(1594,258,276,'现有网页 · WEB-01',h=30)
   fields=[(316,'显示名称','布局参考'),(400,'内容地址','docs.example.test/workspace'),(484,'放入位置','DOC-01 右侧 / 复用分区'),(568,'尺寸约束','最小宽度 320 px'),(652,'内容生命周期','切布局保留 / 关闭时确认')]
   for yy,t,value in fields:s.text(1594,yy,t,13,C['muted']);s.rect(1594,yy+14,276,40,'#f8fafd',6,C['line']);s.text(1606,yy+40,value,13)
   s.rect(1594,738,276,105,C['greenbg'],8);s.text(1609,769,'只调整 WEB-01 的位置。',14,C['green'],600);s.text(1609,798,'同一个网页保持打开，',13,C['green']);s.text(1609,824,'地址与阅读位置不变。',13,C['green'])
   s.text(1594,881,'先预览，再应用；取消则不生效。',13,C['muted'])
  status(s,'edit')
 return s.save('workbench-v2-02-layout-editor.svg')

def review():
 s=SVG('模块化工作台 V2 · 切换布局保留状态','可编辑SVG概念稿。由开发切至审阅，DOC-01与WEB-01实例保持，文件树收起，终端收至运行托盘；聊天输入和未保存草稿不变。')
 shell(s,'03','切换到审阅：移动或收起面板，不重新创建内容')
 with s.group('workspace',(680,80,1224,928)):
  workspace_header(s,'review')
  with s.group('collapsed-files',(696,208,40,628),'data-instance="FILE-01"'):
   s.rect(696,208,40,628,'#e9eff9',7,C['line']);s.icon('folder',705,224,22,C['blue']);s.icon('down',707,263,18,C['blue']);s.icon('search',707,306,18)
  document(s,752,208,690,628,True);browser(s,1458,208,430,628,True)
  with s.group('retained-state-tray',(696,852,1192,84),'data-instance="TERM-01"'):
   s.rect(696,852,1192,84,'#fff',9,C['line']);s.icon('term',712,866,20,C['blue']);s.text(744,882,'终端已收起',15,weight=600);s.text(874,882,'TERM-01 / dev-17',13,C['muted'],extra='class="mono"');s.dot(1080,877,C['green'],3);s.text(1092,882,'持续运行 · 未重启',13,C['green']);s.button(1764,861,109,'展开终端',h=32)
   for xx,w,t in [(710,274,'DOC-01：未保存草稿仍在'),(994,270,'WEB-01：阅读位置 42%'),(1274,292,'FILE-01：原文件选择保留'),(1576,296,'对话：未发送草稿保持原样')]:s.chip(xx,899,w,t,'#f2f5fa',C['muted'],h=25,size=12)
  status(s,'review')
 return s.save('workbench-v2-03-switch-preserve.svg')

if __name__=='__main__':
 result=[daily(),editor(),review()]
 (OUT/'design-metadata.json').write_text(json.dumps({'size':[1920,1080],'conceptOnly':True,'states':['daily','editor','review'],'chatBox':[200,80,464,928],'workspaceBox':[680,80,1224,928],'composerBox':[220,815,424,161],'files':[p.name for p in result],'scope':'Static editable vector proposal; no plugin, profile, model or live GUI changes.'},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 for p in result:print(p)
