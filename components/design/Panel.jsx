// Panel — labeled block = SectionHead + a single flat elevated card
// that contains one or more rows. Matches the redesign spec's main
// list container (see Trade home: "Schedule", "New requests").

import React from "react";
import { View, StyleSheet } from "react-native";
import SectionHead from "./SectionHead";
import { useTheme } from "../../hooks/useTheme";
import { Radius, Spacing } from "../../constants/Typography";

export default function Panel({ title, onPress, trailing, chevron = true, children, style, bodyStyle }) {
  const { colors: c } = useTheme();
  return (
    <View style={style}>
      {title && (
        <SectionHead
          title={title}
          onPress={onPress}
          chevron={chevron}
          trailing={trailing}
        />
      )}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <View
          style={[
            styles.card,
            { backgroundColor: c.elevate, borderColor: c.border },
            bodyStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
});
