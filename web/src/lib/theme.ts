// The site theme: dusk (data-theme="dark") is the default; "day" (light) only when the visitor chose it.

/** The dusk background. Used for the browser's theme-color; must equal --bg in globals.css's dark block. */
export const DUSK_BG = '#0a0b1e';

// Runs before the first paint (inline in the layout), so a saved day theme never flashes dusk.
export const THEME_SCRIPT = `try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;
