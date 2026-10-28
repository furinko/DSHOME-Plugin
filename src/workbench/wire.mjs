/* Explicit, strict public Typert contribution. No SRC reflection or untyped RPC. */
import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
const service = 'dshomeWorkspace', packageName = 'dshome-plugin';
const schemas = {
  sessionId: z.string().min(1).max(4096), path: z.string().min(1).max(4096),
  expectedProjectId: z.string().min(1).max(4096), expectedAbsolutePath: z.string().min(1).max(4096),
  request: z.strictObject({ id: z.string().min(1).max(128).regex(/^[\w-]+$/u), cols: z.number().int().min(2), rows: z.number().int().min(1), shellPath: z.string().optional() }),
  text: z.string().max(2 * 1024 * 1024), expectedVersion: z.string().min(1).max(4096),
};
const results = {
  createTerminal: z.strictObject({ id: z.string(), title: z.string(), shell: z.strictObject({ path: z.string(), args: z.array(z.string()), name: z.string() }), cwd: z.string(), cols: z.number(), rows: z.number(), state: z.enum(['failed', 'running', 'exited']), exitCode: z.number().nullable(), error: z.string().optional() }),
  project: z.strictObject({ projectId: z.string(), workspaceRoot: z.string(), writable: z.boolean(), maxBytes: z.number() }),
  list: z.strictObject({ projectId: z.string(), absolutePath: z.string(), entries: z.array(z.strictObject({ name: z.string().min(1).max(4096), type: z.enum(['file', 'directory', 'other']) })).max(2000), truncated: z.boolean() }),
  read: z.strictObject({ projectId: z.string(), absolutePath: z.string(), text: z.string(), version: z.string(), bytes: z.number() }),
  save: z.strictObject({ projectId: z.string(), absolutePath: z.string(), version: z.string() }),
};
const parameters = { project: ['sessionId'], list: ['sessionId', 'path', 'expectedProjectId'], read: ['sessionId', 'path', 'expectedProjectId'], save: ['sessionId', 'path', 'text', 'expectedVersion', 'expectedProjectId', 'expectedAbsolutePath'] };
const codec = (name, schema) => ({ mode: 'strict', typeSymbol: packageName + '#' + name, create: () => schema });
export const remoteInfo = createTypertRemoteInfo({ package: packageName,
  methods: Object.fromEntries(Object.entries(parameters).map(([method, names]) => [service + '/' + method, {
    service, invocation: { kind: 'direct' }, cancellation: { parameter: 'signal' },
    parameters: names.map(name => ({ name, source: 'json', codec: codec(name, schemas[name]), strictCodec: codec(name, schemas[name]) })),
    result: codec(method + 'Result', results[method]),
  }]).concat([[service + '/createTerminal', {
    service, invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, cancellation: { parameter: 'signal' },
    parameters: [{ name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: { ...codec('sessionId', schemas.sessionId), typeSymbol: '@deepseek-ai/dsh-session/types#SessionId' }, strictCodec: { ...codec('sessionId', schemas.sessionId), typeSymbol: '@deepseek-ai/dsh-session/types#SessionId' } }, ...['request', 'expectedProjectId'].map(name => ({ name, source: 'json', codec: codec(name, schemas[name]), strictCodec: codec(name, schemas[name]) }))],
    result: codec('createTerminalResult', results.createTerminal),
  }]])) }, z);
export const TYPERT = { package: packageName, face: 'host', schemas: [], invocations: remoteInfo.descriptors,
  model: { services: [{ key: service, exportName: 'WorkbenchFilesService', members: [...Object.keys(parameters), 'createTerminal'].map(name => ({ kind: 'method', name })) }], events: [], objects: [] } };
export const REMOTE_TYPERT = { package: packageName, descriptors: remoteInfo.descriptors };
