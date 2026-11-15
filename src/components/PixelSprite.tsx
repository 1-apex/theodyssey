import Svg,{Rect} from 'react-native-svg';
import {spx} from '../theme/scale';
import pixels from '../../assets/sprites/lovable-pixels.json';
export const palette=pixels.palette;
export const colors=pixels.colors;
export {pixels};
/** `size` is the pixel-cell size at phone scale; it grows with the app's size factor, as a whole number. */
export function PixelSprite({rows,size=4,title}:{rows:string[];size?:number;title?:string}){const cell=spx(size);return <Svg viewBox={`0 0 ${rows[0].length} ${rows.length}`} width={rows[0].length*cell} height={rows.length*cell} accessibilityLabel={title} accessible={!!title}>{rows.flatMap((row,y)=>[...row].map((ch,x)=>ch==='.'?null:<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={palette[ch as keyof typeof palette]??'transparent'}/>))}</Svg>}
