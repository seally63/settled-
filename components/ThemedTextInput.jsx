import React, { useState } from 'react'
import { TextInput, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../hooks/useTheme'
import { FontFamily, Radius } from '../constants/Typography'

const ThemedTextInput = ({ style, showPasswordToggle = false, secureTextEntry, ...props }) => {
    const { colors } = useTheme()
    const [isPasswordVisible, setIsPasswordVisible] = useState(false)

    const isSecure = showPasswordToggle ? (secureTextEntry && !isPasswordVisible) : secureTextEntry

    const baseStyle = {
        backgroundColor: colors.elevate,
        color: colors.text,
        padding: 16,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 16,
        fontFamily: FontFamily.bodyRegular,
    }

    if (showPasswordToggle && secureTextEntry) {
        return (
            <View style={{ position: 'relative', width: '100%' }}>
                <TextInput
                    placeholderTextColor={colors.textMuted}
                    style={[baseStyle, { paddingRight: 48 }, style]}
                    secureTextEntry={isSecure}
                    {...props}
                />
                <Pressable
                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                    style={{
                        position: 'absolute',
                        right: 12,
                        top: 0,
                        bottom: 0,
                        justifyContent: 'center',
                        padding: 4,
                    }}
                    hitSlop={8}
                >
                    <Ionicons
                        name={isPasswordVisible ? 'eye-off' : 'eye'}
                        size={20}
                        color={colors.textMuted}
                    />
                </Pressable>
            </View>
        )
    }

    return (
        <TextInput
            placeholderTextColor={colors.textMuted}
            style={[baseStyle, style]}
            secureTextEntry={isSecure}
            {...props}
        />
    )
}

export default ThemedTextInput
