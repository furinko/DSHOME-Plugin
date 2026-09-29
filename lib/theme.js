// dshome-plugin — theme module.
//
// Registers the brand accent (light/dark pairs) through the official `theme`
// service and replaces the stock brand slots in the sidebar and the
// conversation hero.
//
// Colour intent: brand blue #4D6BFE in light mode, lifted to #6B84FF in dark so
// it keeps contrast against the deep navy background.

const BRAND_LIGHT = '#4D6BFE';
const BRAND_DARK = '#6B84FF';
/** Label shown in the sidebar and conversation hero. */
export const BRAND_NAME = 'DSHOME';

/** Token overrides handed to `theme.overrideTokens`. */
export const TOKENS = {
  // Accent
  '--dsw-alias-brand-primary': { light: BRAND_LIGHT, dark: BRAND_DARK },
  '--dsw-alias-state-business-primary': { light: BRAND_LIGHT, dark: BRAND_DARK },
  '--dsw-alias-button-primary-fill': { light: BRAND_LIGHT, dark: BRAND_LIGHT },
  '--dsw-alias-button-primary-hover': { light: '#3E5BF0', dark: '#5B7BFF' },

  // Background layers (deep navy in dark mode)
  '--dsw-alias-bg-base': { light: '#f7f9fc', dark: '#0f1420' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#131a29' },
  '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#172032' },
  '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#1a2338' },
  '--dsw-alias-bg-module-platform': { light: '#ffffff', dark: '#131a29' },

  // Sidebar sits one step deeper than the base
  '--dsw-specific-sidebar-fill': { light: '#eef2f9', dark: '#0c111c' },

  // Borders
  '--dsw-alias-border-l1': { light: '#e3e9f3', dark: '#1e2a44' },
  '--dsw-alias-border-l2': { light: '#d3dcea', dark: '#2a3a5c' },

  // Text
  '--dsw-alias-label-primary': { light: '#1a2233', dark: '#dbe4f0' },
  '--dsw-alias-label-secondary': { light: '#4a5a78', dark: '#c3d0e4' },
  '--dsw-alias-label-tertiary': { light: '#6b7a99', dark: '#8fa3c0' },

  // Interactive
  '--dsw-alias-interactive-bg-hover': {
    light: 'rgba(77,107,254,0.08)',
    dark: 'rgba(107,132,255,0.10)',
  },
};

/**
 * Apply theme tokens and register the brand slots.
 *
 * @param {object} ctx      cordis context
 * @param {object} deps     { jsx, primitives, version }
 */
export function applyTheme(ctx, deps) {
  const { jsx, primitives, version = '' } = deps;

  // Fall back to a simple inline mark when the primitives package does not
  // export the logo, so the slot never renders an empty hole.
  const Logo = primitives && primitives.FishLogo;
  const Mark = ({ size = 24, className }) => (Logo
    ? jsx(Logo, { size, className })
    : jsx('span', {
      className,
      style: { fontSize: size * 0.8, lineHeight: 1, color: BRAND_LIGHT },
      children: '◈',
    }));

  const Name = () => jsx('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24 },
    children: [
      jsx('span', {
        style: { color: `var(--dsw-alias-brand-primary, ${BRAND_LIGHT})`, fontWeight: 600 },
        children: BRAND_NAME,
      }),
      version ? jsx('span', {
        style: {
          height: 16,
          lineHeight: '16px',
          fontSize: 9,
          fontWeight: 500,
          fontFamily: "Consolas, 'Cascadia Mono', monospace",
          letterSpacing: 0,
          color: 'var(--dsw-alias-label-primary-inverted, #0f1115)',
          background: 'var(--dsw-alias-label-primary, #f4f6fb)',
          borderRadius: 3,
          padding: '0 4px',
          whiteSpace: 'nowrap',
          alignSelf: 'center',
        },
        children: version,
      }) : null,
    ].filter(Boolean),
  });

  // 1) Token overrides.
  try {
    const theme = ctx.get('theme');
    if (theme && typeof theme.overrideTokens === 'function') {
      theme.overrideTokens('dshome-plugin', TOKENS);
    }
  } catch (error) {
    console.warn('dshome-plugin: token override failed', error);
  }

  // 2) Brand slots.
  //
  // `slots.inject(name, fn)` is a *dependency declaration*: `fn` runs once that
  // slot exists, and its return value is what inject keeps. It must therefore
  // return something — typically the registration handle from `register`, whose
  // disposal is then owned by inject.
  //
  // Nesting the calls is how a group of slots is registered together: the outer
  // inject waits for the first slot, and only inside that callback do we ask for
  // the next one. A generator function cannot be used here, because inject does
  // not iterate its callback's result — yielding registrations would silently
  // register nothing.
  try {
    const slots = ctx.slots;
    if (!slots) throw new Error('slots service unavailable');

    const registerBrand = () => {
      const offMark = slots.register({ name: 'sidebar.brand.mark' }, (props) =>
        jsx(Mark, { size: props?.size, className: props?.className }));
      const offName = slots.register({ name: 'sidebar.brand.name' }, () => jsx(Name, {}));
      const offHero = slots.register({ name: 'conversation.hero.brand.mark' }, (props) =>
        jsx(Mark, { size: props?.size, className: props?.className }));
      return () => {
        for (const off of [offMark, offName, offHero]) {
          if (typeof off === 'function') off();
          else if (off && typeof off.dispose === 'function') off.dispose();
        }
      };
    };

    return slots.inject('sidebar.brand.mark', () =>
      slots.inject('sidebar.brand.name', () =>
        slots.inject('conversation.hero.brand.mark', registerBrand)));
  } catch (error) {
    console.warn('dshome-plugin: brand slot registration failed', error);
  }
}
