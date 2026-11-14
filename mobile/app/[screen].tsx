import {useLocalSearchParams} from 'expo-router';
import {Screen, ScreenName} from '../src/Screen';
export default function Route(){const {screen}=useLocalSearchParams<{screen:string}>();const screens:ScreenName[]=['create','join','preview','lobby','voyage','finish'];return <Screen screen={screens.includes(screen as ScreenName)?screen as ScreenName:'home'}/>}
