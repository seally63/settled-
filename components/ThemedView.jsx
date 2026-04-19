import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

const ThemedView = ({ style, safe = false, children, ...rest }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Wrap any bare string/number child so they're valid under <View/>
  const wrapChild = (node) => {
    if (node == null || node === false) return null;
    if (typeof node === 'string' || typeof node === 'number') {
      return <Text style={{ color: colors.text }}>{String(node)}</Text>;
    }
    return node;
  };
  const wrappedChildren = React.Children.map(children, wrapChild);

  if (!safe) {
    return (
      <View style={[{ backgroundColor: colors.background }, style]} {...rest}>
        {wrappedChildren}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
      {...rest}
    >
      {wrappedChildren}
    </View>
  );
};

export default ThemedView;
