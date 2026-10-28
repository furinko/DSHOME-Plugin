// src/host.mjs
import { TypertRemoteService, RemoteError } from "@deepseek-ai/dsh-typert-protocol";

// src/workbench/files.mjs
var WorkbenchFileError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkbenchFileError";
    this.code = "workbench/" + code;
  }
};
var refuse = (code, message) => {
  throw new WorkbenchFileError(code, message);
};
var MAX_BYTES = 2 * 1024 * 1024;
function createWorkbenchFiles({ fs, sessions, sandboxPolicy, maxBytes = MAX_BYTES }) {
  if (!fs || !sessions || !sandboxPolicy || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Missing host filesystem capabilities");
  const textBytes = (text) => new TextEncoder().encode(text).length;
  function owner(caller) {
    if (caller?.principal?.kind !== "owner") refuse("owner-required", "\u6587\u4EF6\u7F16\u8F91\u4EC5\u5BF9\u5DF2\u8BA4\u8BC1\u672C\u5730\u4F7F\u7528\u8005\u5F00\u653E");
  }
  function session(id) {
    const live = sessions.get(id);
    if (!live || live.id !== id) refuse("session-unavailable", "\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u7ED3\u675F");
    return live;
  }
  async function scope(id, caller, signal) {
    owner(caller);
    signal?.throwIfAborted();
    const live = session(id), resolvedPolicy = sandboxPolicy.resolve({ session: live }), policy = resolvedPolicy && Object.freeze({ ...resolvedPolicy });
    if (!policy || !["read-only", "workspace-write", "danger-full-access"].includes(policy.mode)) refuse("policy-unavailable", "\u65E0\u6CD5\u786E\u5B9A\u672C\u6B21\u6587\u4EF6\u7B56\u7565");
    const root = await fs.resolve(policy.workspaceRoot, { signal });
    const info = await fs.stat(root, signal);
    if (info?.type !== "directory") refuse("workspace-unavailable", "\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55\u4E0D\u53EF\u7528");
    return { live, root, policy, projectId: fs.fileUrl(root), sessionId: id };
  }
  function pathInput(path) {
    if (typeof path !== "string" || !path || path.length > 4096 || path.includes("\0")) refuse("bad-path", "\u6587\u4EF6\u8DEF\u5F84\u65E0\u6548");
  }
  async function target(scope2, path, signal) {
    pathInput(path);
    const entry = await fs.lstat(path, { cwd: scope2.policy.workspaceRoot }, signal);
    if (entry?.type !== "file") refuse("not-regular-file", "\u53EA\u80FD\u7F16\u8F91\u5DF2\u6709\u7684\u666E\u901A\u6587\u4EF6\uFF0C\u4E0D\u8DDF\u968F\u672B\u7EA7\u7B26\u53F7\u94FE\u63A5");
    const target2 = await fs.resolve(path, { cwd: scope2.policy.workspaceRoot, signal });
    if (!fs.contains(scope2.root, target2)) refuse("outside-workspace", "\u6587\u4EF6\u5FC5\u987B\u4F4D\u4E8E\u5F53\u524D\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u5185");
    const info = await fs.stat(target2, signal);
    if (info?.type !== "file") refuse("not-regular-file", "\u76EE\u6807\u5DF2\u4E0D\u518D\u662F\u666E\u901A\u6587\u4EF6");
    if (info.size !== void 0 && info.size > maxBytes) refuse("too-large", "\u6587\u4EF6\u8D85\u51FA\u7F16\u8F91\u5927\u5C0F\u4E0A\u9650");
    return { target: target2, info };
  }
  async function unchangedScope(before, caller, signal) {
    const after = await scope(before.sessionId, caller, signal);
    if (after.live !== before.live || after.projectId !== before.projectId || after.policy.workspaceRoot !== before.policy.workspaceRoot) refuse("workspace-changed", "\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6587\u4EF6");
    return after;
  }
  function boundProject(selected, expectedProjectId) {
    if (typeof expectedProjectId !== "string" || !expectedProjectId || expectedProjectId.length > 4096 || !expectedProjectId.isWellFormed()) refuse("project-required", "\u6587\u4EF6\u64CD\u4F5C\u5FC5\u987B\u7ED1\u5B9A\u6253\u5F00\u65F6\u7684\u5DE5\u4F5C\u533A");
    if (expectedProjectId !== selected.projectId) refuse("workspace-changed", "\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u5DF2\u53D8\u5316\uFF1B\u65E7\u6587\u6863\u8349\u7A3F\u4ECD\u4FDD\u7559\uFF0C\u672A\u5207\u6362\u4FDD\u5B58\u76EE\u6807");
  }
  async function directory(selected, path, signal) {
    pathInput(path);
    const entry = await fs.lstat(path, { cwd: selected.policy.workspaceRoot }, signal);
    if (entry?.type !== "directory") refuse("not-directory", "\u53EA\u80FD\u5217\u51FA\u5DF2\u6709\u76EE\u5F55\uFF0C\u4E0D\u8DDF\u968F\u672B\u7EA7\u7B26\u53F7\u94FE\u63A5");
    const target2 = await fs.resolve(path, { cwd: selected.policy.workspaceRoot, signal });
    if (!fs.contains(selected.root, target2)) refuse("outside-workspace", "\u76EE\u5F55\u5FC5\u987B\u4F4D\u4E8E\u7ED1\u5B9A\u7684\u9879\u76EE\u5185");
    if ((await fs.stat(target2, signal))?.type !== "directory") refuse("not-directory", "\u76EE\u5F55\u76EE\u6807\u5DF2\u53D8\u5316");
    return target2;
  }
  async function list(sessionId, path, caller, signal, expectedProjectId) {
    const selected = await scope(sessionId, caller, signal);
    boundProject(selected, expectedProjectId);
    const target2 = await directory(selected, path, signal);
    const children = await fs.listDir(target2, signal);
    signal?.throwIfAborted();
    const ordered = children.filter((entry) => typeof entry.name === "string" && entry.name && entry.name.isWellFormed() && entry.name.length <= 4096 && !entry.name.includes("/") && !entry.name.includes("\0") && ![".", ".."].includes(entry.name)).map((entry) => ({ name: entry.name, type: ["file", "directory"].includes(entry.type) ? entry.type : "other" })).sort((a, b) => (a.type !== "directory") - (b.type !== "directory") || a.name.localeCompare(b.name, "en", { numeric: true }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const entries = [];
    let bytes = 0;
    for (const entry of ordered) {
      const cost = textBytes(JSON.stringify({ name: entry.name, type: "directory" })) + 1;
      if (entries.length >= 2e3 || bytes + cost > 256 * 1024) break;
      const child = await fs.lstat(entry.name, { cwd: fs.processPath(target2) }, signal);
      entries.push({ name: entry.name, type: ["file", "directory"].includes(child?.type) ? child.type : "other" });
      bytes += cost;
    }
    entries.sort((a, b) => (a.type !== "directory") - (b.type !== "directory") || a.name.localeCompare(b.name, "en", { numeric: true }));
    const after = await unchangedScope(selected, caller, signal), fresh = await directory(after, path, signal);
    if (fresh.targetKey !== target2.targetKey) refuse("target-changed", "\u5217\u51FA\u671F\u95F4\u76EE\u5F55\u76EE\u6807\u5DF2\u53D8\u5316");
    return { projectId: selected.projectId, absolutePath: fs.processPath(target2), entries, truncated: entries.length !== children.length };
  }
  async function read(sessionId, path, caller, signal, expectedProjectId) {
    const selected = await scope(sessionId, caller, signal);
    boundProject(selected, expectedProjectId);
    const { target: file, info: before } = await target(selected, path, signal);
    const bytes = await fs.readBytes(file, signal, maxBytes);
    if (bytes.length > maxBytes) refuse("too-large", "\u6587\u4EF6\u8D85\u51FA\u7F16\u8F91\u5927\u5C0F\u4E0A\u9650");
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      refuse("not-text", "\u6587\u4EF6\u4E0D\u662F\u6709\u6548 UTF-8 \u6587\u672C");
    }
    if (text.includes("\0")) refuse("not-text", "\u6587\u4EF6\u5305\u542B\u4E8C\u8FDB\u5236 NUL \u5B57\u8282");
    const after = await fs.stat(file, signal);
    if (after?.type !== "file" || after.version !== before.version) refuse("read-conflict", "\u8BFB\u53D6\u671F\u95F4\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
    await unchangedScope(selected, caller, signal);
    return { projectId: selected.projectId, absolutePath: fs.processPath(file), text, version: after.version, bytes: bytes.length };
  }
  async function save(sessionId, path, text, expectedVersion, caller, signal, expectedProjectId, expectedAbsolutePath) {
    if (typeof text !== "string" || !text.isWellFormed() || text.includes("\0") || textBytes(text) > maxBytes) refuse("invalid-text", "\u4FDD\u5B58\u5FC5\u987B\u662F\u5927\u5C0F\u53D7\u9650\u7684 UTF-8 \u6587\u672C");
    if (typeof expectedVersion !== "string" || !expectedVersion || expectedVersion.length > 4096) refuse("version-required", "\u4FDD\u5B58\u5FC5\u987B\u63D0\u4F9B\u8BFB\u53D6\u65F6\u7684\u5B8C\u6574\u7248\u672C");
    const selected = await scope(sessionId, caller, signal);
    boundProject(selected, expectedProjectId);
    if (typeof expectedAbsolutePath !== "string" || !expectedAbsolutePath || expectedAbsolutePath.length > 4096 || !expectedAbsolutePath.isWellFormed()) refuse("target-required", "\u4FDD\u5B58\u5FC5\u987B\u7ED1\u5B9A\u8BFB\u53D6\u65F6\u7684\u5B8C\u6574\u89C4\u8303\u8DEF\u5F84");
    if (selected.policy.mode === "read-only") refuse("read-only", "\u5F53\u524D\u4F1A\u8BDD\u4E3A\u53EA\u8BFB\uFF1B\u8349\u7A3F\u4E0D\u4F1A\u4E22\u5931");
    const { target: file } = await target(selected, path, signal);
    const current = await unchangedScope(selected, caller, signal);
    if (current.policy.mode === "read-only") refuse("read-only", "\u5F53\u524D\u4F1A\u8BDD\u5DF2\u5207\u6362\u5230\u53EA\u8BFB");
    const fresh = await target(current, path, signal);
    boundProject(current, expectedProjectId);
    if (fs.processPath(fresh.target) !== expectedAbsolutePath) refuse("target-changed", "\u4FDD\u5B58\u76EE\u6807\u4E0E\u6253\u5F00\u6587\u6863\u7684\u89C4\u8303\u8DEF\u5F84\u4E0D\u4E00\u81F4\uFF0C\u672A\u5199\u5165");
    if (fresh.target.targetKey !== file.targetKey) refuse("target-changed", "\u6587\u4EF6\u94FE\u63A5\u6216\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00");
    const outcome = await fs.writeText(fresh.target, text, { kind: "replaceIfVersion", version: expectedVersion }, signal, current.policy);
    return { projectId: current.projectId, absolutePath: fs.processPath(fresh.target), version: outcome.version };
  }
  async function project(sessionId, caller, signal) {
    const selected = await scope(sessionId, caller, signal);
    return { projectId: selected.projectId, workspaceRoot: fs.processPath(selected.root), writable: selected.policy.mode !== "read-only", maxBytes };
  }
  return Object.freeze({ read, save, project, list });
}

// src/workbench/terminal-binding.mjs
var refuse2 = (code, message) => {
  throw new WorkbenchFileError(code, message);
};
var readonly = { set: () => false, defineProperty: () => false, deleteProperty: () => false };
var forwarded = (target, key) => {
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
};
async function createBoundTerminal({ agent, request, expectedProjectId, caller, signal, fs, sessions, files, controller }) {
  const live = () => {
    signal?.throwIfAborted();
    if (!agent || sessions.get(agent.id) !== agent.session) refuse2("session-unavailable", "\u7EC8\u7AEF\u4F1A\u8BDD\u5DF2\u53D8\u5316");
  };
  live();
  const project = await files.project(agent.id, caller, signal);
  if (project.projectId !== expectedProjectId) refuse2("workspace-changed", "Host \u5DE5\u4F5C\u533A\u5DF2\u53D8\u5316\uFF0C\u672A\u542F\u52A8\u539F\u9879\u76EE\u7684\u65B0\u7EC8\u7AEF");
  const runtime = agent.ctx.get("subprocess");
  if (!runtime?.spawnTerminal || !controller?.create) refuse2("terminal-unavailable", "\u771F\u5B9E\u7EC8\u7AEF\u6267\u884C\u670D\u52A1\u4E0D\u53EF\u7528");
  async function pinnedPath(cwd, control = signal) {
    live();
    control?.throwIfAborted();
    const target = await fs.resolve(cwd, { signal: control });
    if (fs.fileUrl(target) !== expectedProjectId) refuse2("workspace-changed", "\u7EC8\u7AEF\u5B9E\u9645\u542F\u52A8\u76EE\u5F55\u4E0E\u7ED1\u5B9A\u9879\u76EE\u4E0D\u540C\uFF0C\u672A\u4EA4\u7ED9\u8FDB\u7A0B\u540E\u7AEF");
    if ((await fs.stat(target, control))?.type !== "directory") refuse2("workspace-unavailable", "\u7EC8\u7AEF\u9879\u76EE\u76EE\u5F55\u4E0D\u53EF\u7528");
    live();
    control?.throwIfAborted();
    return fs.processPath(target);
  }
  const subprocess = new Proxy(runtime, { ...readonly, get(target, key) {
    if (key === "spawnTerminal") return async (spec) => {
      const cwd = await pinnedPath(spec.cwd, spec.signal ?? signal);
      return target.spawnTerminal({ ...spec, cwd });
    };
    return forwarded(target, key);
  } });
  const context = new Proxy(agent.ctx, { ...readonly, get(target, key) {
    if (key === "subprocess") return subprocess;
    if (key === "get") return (name2, ...args) => name2 === "subprocess" ? subprocess : target.get(name2, ...args);
    return forwarded(target, key);
  } });
  const execution = new Proxy(agent, { ...readonly, get(target, key) {
    return key === "ctx" ? context : forwarded(target, key);
  } });
  const info = await controller.create(execution, request, signal);
  await pinnedPath(info.cwd);
  return info;
}

// src/workbench/wire.mjs
import { z } from "zod";
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
var service = "dshomeWorkspace";
var packageName = "dshome-plugin";
var schemas = {
  sessionId: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  expectedProjectId: z.string().min(1).max(4096),
  expectedAbsolutePath: z.string().min(1).max(4096),
  request: z.strictObject({ id: z.string().min(1).max(128).regex(/^[\w-]+$/u), cols: z.number().int().min(2), rows: z.number().int().min(1), shellPath: z.string().optional() }),
  text: z.string().max(2 * 1024 * 1024),
  expectedVersion: z.string().min(1).max(4096)
};
var results = {
  createTerminal: z.strictObject({ id: z.string(), title: z.string(), shell: z.strictObject({ path: z.string(), args: z.array(z.string()), name: z.string() }), cwd: z.string(), cols: z.number(), rows: z.number(), state: z.enum(["failed", "running", "exited"]), exitCode: z.number().nullable(), error: z.string().optional() }),
  project: z.strictObject({ projectId: z.string(), workspaceRoot: z.string(), writable: z.boolean(), maxBytes: z.number() }),
  list: z.strictObject({ projectId: z.string(), absolutePath: z.string(), entries: z.array(z.strictObject({ name: z.string().min(1).max(4096), type: z.enum(["file", "directory", "other"]) })).max(2e3), truncated: z.boolean() }),
  read: z.strictObject({ projectId: z.string(), absolutePath: z.string(), text: z.string(), version: z.string(), bytes: z.number() }),
  save: z.strictObject({ projectId: z.string(), absolutePath: z.string(), version: z.string() })
};
var parameters = { project: ["sessionId"], list: ["sessionId", "path", "expectedProjectId"], read: ["sessionId", "path", "expectedProjectId"], save: ["sessionId", "path", "text", "expectedVersion", "expectedProjectId", "expectedAbsolutePath"] };
var codec = (name2, schema) => ({ mode: "strict", typeSymbol: packageName + "#" + name2, create: () => schema });
var remoteInfo = createTypertRemoteInfo({
  package: packageName,
  methods: Object.fromEntries(Object.entries(parameters).map(([method, names]) => [service + "/" + method, {
    service,
    invocation: { kind: "direct" },
    cancellation: { parameter: "signal" },
    parameters: names.map((name2) => ({ name: name2, source: "json", codec: codec(name2, schemas[name2]), strictCodec: codec(name2, schemas[name2]) })),
    result: codec(method + "Result", results[method])
  }]).concat([[service + "/createTerminal", {
    service,
    invocation: { kind: "direct" },
    scope: { context: "agent", wire: "agentId" },
    cancellation: { parameter: "signal" },
    parameters: [{ name: "agent", wire: "agentId", source: "lookup", lookup: "agent", codec: { ...codec("sessionId", schemas.sessionId), typeSymbol: "@deepseek-ai/dsh-session/types#SessionId" }, strictCodec: { ...codec("sessionId", schemas.sessionId), typeSymbol: "@deepseek-ai/dsh-session/types#SessionId" } }, ...["request", "expectedProjectId"].map((name2) => ({ name: name2, source: "json", codec: codec(name2, schemas[name2]), strictCodec: codec(name2, schemas[name2]) }))],
    result: codec("createTerminalResult", results.createTerminal)
  }]]))
}, z);
var TYPERT = {
  package: packageName,
  face: "host",
  schemas: [],
  invocations: remoteInfo.descriptors,
  model: { services: [{ key: service, exportName: "WorkbenchFilesService", members: [...Object.keys(parameters), "createTerminal"].map((name2) => ({ kind: "method", name: name2 })) }], events: [], objects: [] }
};
var REMOTE_TYPERT = { package: packageName, descriptors: remoteInfo.descriptors };

// src/host.mjs
var name = "dshome-plugin";
var inject = ["fs", "sessions", "sandboxPolicy", "typert"];
var WorkbenchFilesService = class extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, "dshomeWorkspace");
    this.files = createWorkbenchFiles({ fs: ctx.fs, sessions: ctx.sessions, sandboxPolicy: ctx.sandboxPolicy });
  }
  caller() {
    return this.ctx.invocation?.peer;
  }
  async invoke(method, values, signal, binding = []) {
    try {
      return await this.files[method](...values, this.caller(), signal, ...binding);
    } catch (error) {
      if (typeof error?.code === "string" && /^(FS_|workbench\/)/.test(error.code)) throw new RemoteError(error.code, error.message, {});
      throw error;
    }
  }
  async createTerminal(agent, request, expectedProjectId, signal) {
    try {
      const binding = this.terminalBinding;
      if (!binding) throw new RemoteError("workbench/terminal-unavailable", "\u771F\u5B9E\u7EC8\u7AEF\u670D\u52A1\u4E0D\u53EF\u7528", {});
      return await createBoundTerminal({ agent, request, expectedProjectId, caller: this.caller(), signal: AbortSignal.any([signal, binding.signal]), fs: this.ctx.fs, sessions: this.ctx.sessions, files: this.files, controller: binding.controller });
    } catch (error) {
      if (typeof error?.code === "string" && /^(FS_|workbench\/)/.test(error.code)) throw new RemoteError(error.code, error.message, {});
      throw error;
    }
  }
  project(sessionId, signal) {
    return this.invoke("project", [sessionId], signal);
  }
  list(sessionId, path, expectedProjectId, signal) {
    return this.invoke("list", [sessionId, path], signal, [expectedProjectId]);
  }
  read(sessionId, path, expectedProjectId, signal) {
    return this.invoke("read", [sessionId, path], signal, [expectedProjectId]);
  }
  save(sessionId, path, text, expectedVersion, expectedProjectId, expectedAbsolutePath, signal) {
    return this.invoke("save", [sessionId, path, text, expectedVersion], signal, [expectedProjectId, expectedAbsolutePath]);
  }
};
function apply(ctx) {
  const service2 = new WorkbenchFilesService(ctx);
  ctx.inject(["terminalController"], (child) => {
    const life = new AbortController(), binding = { controller: child.get("terminalController"), signal: life.signal };
    service2.terminalBinding = binding;
    child.effect(() => () => {
      life.abort();
      if (service2.terminalBinding === binding) service2.terminalBinding = null;
    });
  });
  ctx.typert.register(TYPERT);
}
var host_default = { name, inject, apply };
export {
  WorkbenchFilesService,
  apply,
  host_default as default,
  inject,
  name
};
