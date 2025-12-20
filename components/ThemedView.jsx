import React from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';

const ThemedView = ({ style, safe = false, children, ...rest }) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme] ?? Colors.light;
  const insets = useSafeAreaInsets(); // Always call hooks unconditionally

  // Wrap any bare string/number child so they're valid under <View/>
  const wrapChild = (node) => {
    if (node == null || node === false) return null;
    if (typeof node === 'string' || typeof node === 'number') {
      return <Text style={{ color: theme.text }}>{String(node)}</Text>;
    }
    return node;
  };
  const wrappedChildren = React.Children.map(children, wrapChild);

  if (!safe) {
    return (
      <View style={[{ backgroundColor: theme.background }, style]} {...rest}>
        {wrappedChildren}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: theme.background,
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
