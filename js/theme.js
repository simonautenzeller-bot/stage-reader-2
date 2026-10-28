const THEME_COLORS = { eink: '#ffffff', light: '#f4f4f0', dark: '#111111' };

export function applyTheme(settings) {
  document.documentElement.dataset.theme = settings.appTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[settings.appTheme] ?? '#ffffff');
}
