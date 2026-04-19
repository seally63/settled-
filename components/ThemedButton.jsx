import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/Colors'
import { useTheme } from '../hooks/useTheme'
import { TypeVariants, Radius } from '../constants/Typography'
// (FontFamily is indirectly applied through TypeVariants presets.)

/**
 * ThemedButton — primary CTA by default, with extra variants per redesign.
 *
 * Legacy usage:
 *   <ThemedButton onPress={...}>{label}</ThemedButton>        // children = label
 *   <ThemedButton style={{...}}><Text>Go</Text></ThemedButton> // custom child
 *
 * New usage:
 *   <ThemedButton variant="ghost" size="sm" label="Track" />
 *   variant:  'primary' | 'dark' | 'ghost' | 'outline' | 'danger' | 'success'
 *   size:     'sm' | 'md' | 'lg'
 */
function ThemedButton({
  style,
  children,
  variant = 'primary',
  size = 'md',
  label,
  icon,
  fullWidth = false,
  ...props
}) {
  const { colors } = useTheme()

  const sizes = {
    sm: { paddingVertical: 10, paddingHorizontal: 14, radius: Radius.md, font: TypeVariants.buttonSm },
    md: { paddingVertical: 14, paddingHorizontal: 18, radius: Radius.md + 2, font: TypeVariants.button },
    lg: { paddingVertical: 17, paddingHorizontal: 20, radius: Radius.lg - 2, font: TypeVariants.button },
  }
  const s = sizes[size] || sizes.md

  const variants = {
    primary: { bg: Colors.primary,         fg: '#FFFFFF', border: 'transparent' },
    dark:    { bg: colors.text,            fg: colors.bg, border: 'transparent' },
    ghost:   { bg: colors.elevate2,        fg: colors.text, border: colors.border },
    outline: { bg: 'transparent',          fg: colors.text, border: colors.borderStrong },
    danger:  { bg: Colors.status.declined, fg: '#FFFFFF', border: 'transparent' },
    success: { bg: Colors.status.accepted, fg: '#0B0B0D', border: 'transparent' },
  }
  const v = variants[variant] || variants.primary

  // Back-compat: allow passing arbitrary children (most legacy callers wrap a <Text>).
  // If `label` or a bare string is passed, we typeset it ourselves.
  const content = (() => {
    if (label != null) return <Text style={[s.font, { color: v.fg }]}>{label}</Text>
    if (typeof children === 'string') return <Text style={[s.font, { color: v.fg }]}>{children}</Text>
    return children
  })()

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: v.border === 'transparent' ? 0 : 1,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          borderRadius: s.radius,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    >
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  iconWrap: {
    marginRight: 0,
  },
})

export default ThemedButton
