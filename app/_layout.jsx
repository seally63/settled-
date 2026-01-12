import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router'
import { StyleSheet, Text, useColorScheme, View } from 'react-native'
import { Colors } from "../constants/Colors"
import { StatusBar } from 'expo-status-bar'
import { UserProvider } from '../contexts/UserContext'
import { QuotesProvider } from '../contexts/QuotesContext'


const RootLayout = () => {
  const colorScheme = useColorScheme()
  const theme = Colors[colorScheme] ?? Colors.light

  
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <QuotesProvider>
          <StatusBar value="auto" />
          <Stack screenOptions={{
              headerStyle: { backgroundColor: theme.navBackground },
              headerTintColor: theme.title,
          }}>
            <Stack.Screen name='(auth)' options={{ headerShown: false}} />
            <Stack.Screen name='(dashboard)' options={{ headerShown: false}} />
            <Stack.Screen name='(admin)' options={{ headerShown: false}} />
            <Stack.Screen name="index" options={{ title: 'Home'}}/>

          </Stack>
        </QuotesProvider>
      </UserProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout

const styles = StyleSheet.create({})
