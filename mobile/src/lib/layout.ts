import { useWindowDimensions } from 'react-native';

// Layout from the current window, not the device: the iPhone Duo changes size when it folds or unfolds,
// and iPad split view resizes the window while the app runs. useWindowDimensions re-renders on each change.
export const CONTENT_MAX = 1040;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  // Two columns once a column can be at least ~330 pt wide (unfolded Duo, iPad, landscape).
  const columns = width >= 700 ? 2 : 1;
  const compact = width < 380 || height < 700; // the Duo's outer screen and small phones
  return {
    width,
    height,
    columns,
    compact,
    gutter: compact ? 12 : 16,
    // Maps get about half the window height, within sensible bounds.
    mapHeight: Math.round(Math.min(520, Math.max(260, height * (columns === 2 ? 0.6 : 0.48)))),
  };
}
