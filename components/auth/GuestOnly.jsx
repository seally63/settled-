import { useRouter } from "expo-router"
import { useUser } from "../../hooks/useUser"
import { useEffect } from "react"
import ThemedLoader from "../ThemedLoader"

const GuestOnly = ({ children }) => {
  const { user, authChecked } = useUser()  
  const router = useRouter ()

//if user is not null (&& user !==null), redirect to login page  
  useEffect(() => {
    if (authChecked && user !== null) {
      router.replace("/profile")  
    }
  },[user, authChecked])

  if (!authChecked || user) {
    return (
      <ThemedLoader />
    )
  }

  return children
}

export default GuestOnly