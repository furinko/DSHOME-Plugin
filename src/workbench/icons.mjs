import React from 'react';
const paths = {
  files: ['M3 7h7l2 2h9v11H3z','M3 7V4h6l2 3'],
  document: ['M6 3h8l4 4v14H6z','M14 3v5h4','M9 12h6M9 16h6'],
  terminal: ['M4 5h16v14H4z','m8 9 3 3-3 3M13 15h3'],
  web: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18'],
  note: ['M4 3h16v12l-6 6H4z','M14 21v-6h6','M8 8h8M8 11h5'],
  search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0','m15 15 6 6'],
  layout: ['M3 4h18v16H3z','M8 4v16M8 13h13'],
  plus: ['M12 5v14M5 12h14'], save: ['M5 3h13l3 3v15H3V3z','M7 3v6h10V3M7 21v-7h10v7'],
  more: ['M4 12h1M11 12h1M18 12h1'], close: ['m6 6 12 12M6 18 18 6'],
  minimize: ['M5 12h14'], maximize: ['M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6'],
  restore: ['M8 3v5H3M16 3v5h5M21 16h-5v5M3 16h5v5'],
  download: ['M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'],
  compare: ['M8 3H3v18h5M16 3h5v18h-5M9 8h6m-3-3 3 3-3 3M15 16H9m3-3-3 3 3 3'],
  quote: ['M5 6h5v6H6c0 3 1 4 3 5M14 6h5v6h-4c0 3 1 4 3 5'],
  refresh: ['M20 7v5h-5M4 17v-5h5','M5 8a8 8 0 0 1 13-3l2 3M19 16a8 8 0 0 1-13 3l-2-3'],
  check: ['m5 12 4 4L19 6'], chevron: ['m9 5 7 7-7 7'],
  arrow: ['m12 5-7 7m7-7 7 7M12 5v14'], eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12','M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M12 7v5l3 2'],
  command: ['M8 8H5a3 3 0 1 1 3-3v14a2 2 0 1 1-2-2h13a2 2 0 1 1-2 2V5a2 2 0 1 1 2 2H8v10'],
  external: ['M14 3h7v7m0-7L10 14','M10 3H3v18h18v-7'],
  connection: ['M8 5h8v5H8zM5 15h14v5H5zM12 10v5'],
};
export function Icon({ name, size = 18, className = '' }) {
  return React.createElement('svg', { className: 'wb-icon ' + className, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false },
    (Object.hasOwn(paths, name) ? paths[name] : paths.document).map((d, index) => React.createElement('path', { key: index, d })));
}
