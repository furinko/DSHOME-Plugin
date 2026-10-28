// Only plugin-owned surfaces consume these aliases. Never rewrite Host tokens,
// AppFrame columns, a native slot's owner, or another plugin's controls.
export const chromeCSS = `
:where(.dshome-v2,.wb-project-host,.dshome-wb-switch){--wb-surface:var(--dsw-alias-bg-base,#fff);--wb-text:var(--dsw-alias-label-primary,#162b48);--wb-muted:color-mix(in srgb,var(--wb-text) 78%,var(--wb-surface));--wb-border:var(--dsw-alias-border-l2,#dbe3ef);--wb-accent:var(--dsw-alias-brand-primary,#3f5ce8);--wb-solid-accent:#3f5ce8;--wb-backdrop:color-mix(in srgb,var(--wb-surface) 95%,var(--wb-text));--wb-selected:color-mix(in srgb,var(--wb-surface) 88%,var(--wb-accent));--wb-warning:light-dark(#885000,#ffd28a);font-family:var(--dsh-font-family-text,system-ui,sans-serif)}
.dshome-wb-switch{display:inline-flex;align-items:center;flex:none;gap:3px;padding:3px;border:1px solid var(--wb-border);border-radius:9px;background:var(--wb-backdrop);color:var(--wb-text);line-height:1.4;box-sizing:border-box}
.dshome-wb-switch button{appearance:none;box-sizing:border-box;min-height:28px;padding:4px 12px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--wb-muted);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.dshome-wb-switch button[aria-pressed=true]{background:var(--wb-selected);border-color:var(--wb-border);color:var(--wb-text);font-weight:650}
.dshome-wb-switch button:hover:not(:disabled){color:var(--wb-text);background:var(--wb-selected)}
.dshome-wb-switch button:disabled{cursor:not-allowed;opacity:.5}
.dshome-wb-switch button:focus-visible,.wb-project-toolbar button:focus-visible,.wb-project-toolbar select:focus-visible{outline:2px solid var(--wb-accent);outline-offset:2px}
.wb-project-host{min-width:0;box-sizing:border-box;overflow:hidden;background:var(--wb-surface);color:var(--wb-text);font-size:13px;line-height:1.5}
.wb-project-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:none;min-width:0;padding:8px 10px;border-bottom:1px solid var(--wb-border);background:var(--wb-backdrop)}
.wb-project-label{display:flex;align-items:center;gap:7px;flex:1 1 240px;min-width:0;white-space:nowrap;font-size:12px;color:var(--wb-muted)}
.wb-project-label select{min-width:0;width:100%;max-width:360px;flex:1}
.wb-project-toolbar button,.wb-project-toolbar select{box-sizing:border-box;min-height:30px;padding:5px 8px;border:1px solid var(--wb-border);border-radius:6px;background:var(--wb-surface);color:var(--wb-text);font:inherit;font-size:12px}
.wb-project-toolbar button{cursor:pointer;white-space:nowrap}
.wb-project-toolbar button:hover:not(:disabled){background:var(--wb-selected)}
.wb-project-toolbar button:disabled,.wb-project-toolbar select:disabled{opacity:.5;cursor:not-allowed}
.wb-project-toolbar [role=status]{font-size:12px;color:var(--wb-muted)}
.wb-project-host>p[role=status]{flex:none;margin:0;padding:7px 10px;border-bottom:1px solid var(--wb-border);font-size:12px;overflow-wrap:anywhere}
.wb-lifecycle-help{flex:none;min-width:0;padding:5px 10px;border-bottom:1px solid var(--wb-border);color:var(--wb-muted);font-size:12px}
.wb-lifecycle-help summary{cursor:pointer;width:fit-content}
.wb-lifecycle-help summary:focus-visible{outline:2px solid var(--wb-accent);outline-offset:2px}
.wb-lifecycle-help p{margin:6px 0 0;max-height:110px;overflow:auto;overflow-wrap:anywhere}
.wb-project-deck{min-width:0}
`;
