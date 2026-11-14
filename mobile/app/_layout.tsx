import {PressStart2P_400Regular} from '@expo-google-fonts/press-start-2p';
import {UncialAntiqua_400Regular} from '@expo-google-fonts/uncial-antiqua';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useFonts} from 'expo-font';
import {VoyageProvider} from '../src/voyage';
export default function Layout(){const [loaded,error]=useFonts({PressStart2P_400Regular,UncialAntiqua_400Regular});if(!loaded&&!error)return null;return <VoyageProvider><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#001c33'}}}/></VoyageProvider>}
