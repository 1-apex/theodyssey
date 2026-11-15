import {PixelSprite,pixels} from './PixelSprite';
import {c} from '../theme/copy';
export function PixelAvatar({index=0,size=5}:{index?:number;size?:number}){return <PixelSprite rows={[...pixels.HATS[index],...pixels.FACE]} size={size} title={c.avatarNames[index]}/>}
