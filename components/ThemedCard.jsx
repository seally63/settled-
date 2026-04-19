import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import { Radius } from '../constants/Typography'

const ThemedCard = ({ style, ...props }) => {
    const { colors } = useTheme()

    return (
      <View
          style={[
            {
              backgroundColor: colors.elevate,
              borderColor: colors.border,
            },
            styles.card,
            style,
          ]}
          {...props}
      />
    )
}

export default ThemedCard

const styles = StyleSheet.create({
    card: {
        borderRadius: Radius.lg,
        borderWidth: 1,
        padding: 16,
    }
})
