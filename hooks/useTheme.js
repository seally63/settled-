// Convenience hook that returns the full theme bundle.
// Use this everywhere new code needs theme — avoid importing Colors directly.
//
//   const { colors, dark, mode, setMode } = useTheme();
//   <View style={{ backgroundColor: colors.bg }} />

import { useThemeContext } from "../contexts/ThemeContext";

export function useTheme() {
  return useThemeContext();
}

export default useTheme;
