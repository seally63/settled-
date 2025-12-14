import { Image, useColorScheme } from "react-native";

//images
import DarkLogo from '../assets/img/dark_logov2.png';
import LightLogo from '../assets/img/light_logov2.png';

const ThemedLogo = ({ ...props }) => {
    const colorScheme = useColorScheme();
    
    const logo = colorScheme === 'dark' ? DarkLogo : LightLogo;
    
    return(
        <Image source={logo} {...props} />
    )
}

export default ThemedLogo