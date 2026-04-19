import React from 'react'
import { Text } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import { TypeVariants } from '../constants/Typography'

/**
 * ThemedText — text with palette-aware colour and optional typography preset.
 *
 * Back-compat:
 *   <ThemedText title>         → display-sized title colour
 * New API:
 *   <ThemedText variant="h1">  → look up TypeVariants[variant]
 *   <ThemedText variant="body"/>
 *
 * If no variant is passed the component does NOT force a fontFamily, so
 * legacy screens keep their existing type while new screens opt in.
 */
const ThemedText = ({ style, title = false, variant, children, ...props }) => {
  const { colors } = useTheme()

  const baseColor = title ? colors.title : colors.text
  const preset = variant && TypeVariants[variant] ? TypeVariants[variant] : null

  return (
    <Text
      style={[
        preset ? preset : null,
        { color: baseColor },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export default ThemedText
