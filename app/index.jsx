import { StyleSheet, Text } from 'react-native';
import { Link } from 'expo-router'

// themed components
import ThemedView from '../components/ThemedView'
import ThemedLogo from '../components/ThemedLogo'
import Spacer from '../components/Spacer'
import ThemedText from '../components/ThemedText'

const Home = () => {
  return (
    <ThemedView style={styles.container}>
      <ThemedLogo />
      <Spacer height={20} />

      <ThemedText style={styles.title} title={true}>
        Tradify
      </ThemedText>

      <Spacer height={10} />
      <ThemedText>The UK's no.1 trades app</ThemedText>
      <Spacer />


      <Link href="/login" style={styles.link}> 
        <ThemedText>Login Page</ThemedText>
      </Link>
      <Link href="/register" style={styles.link}> 
         <ThemedText>Register Page</ThemedText>
      </Link>
       <Link href="/profile" style={styles.link}> 
         <ThemedText>Profile Page</ThemedText>
      </Link>
    </ThemedView>
  )
}

export default Home

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontWeight: 'bold',
    fontSize: 18
  },

link: {
    marginVertical:10,
    borderBottomWidth: 1
  },

})