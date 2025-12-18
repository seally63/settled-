import { TextInput, useColorScheme  } from 'react-native'
import { Colors } from '../constants/Colors'


const ThemedTextInput = ({ style, ...props}) => {
    const colorScheme = useColorScheme()
    const theme = Colors[colorScheme] ?? Colors.light


    return (
        <TextInput
            style={[
                {
                    backgroundColor : theme.uiBackground,
                    color: theme.text,
                    padding: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.border || '#E5E7EB',
                    fontSize: 16,
            },
            style
        ]}
        {...props}

        />
  )
}

export default ThemedTextInput

