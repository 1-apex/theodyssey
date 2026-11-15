import {Pressable,StyleSheet,Text} from 'react-native';
import Svg,{Path} from 'react-native-svg';
import {colors} from './PixelSprite';
import {fonts} from '../theme/typography';
import {c} from '../theme/copy';

/** Dev A visual control. Supply onPress when the maps handoff is implemented. */
export function DestinationMapsButton({onPress}:{onPress?:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={c.maps} onPress={onPress} style={({pressed})=>[s.button,pressed&&{transform:[{translateY:2}]}]}><Svg width={16} height={18} viewBox="0 0 12 14" accessible={false}><Path d="M3 0h6v1h2v2h1v5h-2v2H8v2H7v2H5v-2H4v-2H2V8H0V3h1V1h2z" fill={colors.ink}/><Path d="M4 3h4v4H4z" fill={colors.gold}/></Svg><Text style={s.label}>{c.mapsShort}</Text></Pressable>;
}
const s=StyleSheet.create({button:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minHeight:44,minWidth:82,paddingHorizontal:9,borderWidth:2,borderColor:colors.ink,backgroundColor:colors.gold,boxShadow:'inset 2px 2px 0 #ffe39a, inset -2px -2px 0 #ab6c0c',flexShrink:0},label:{fontFamily:fonts.heading,fontSize:9,lineHeight:14,color:colors.ink}});
