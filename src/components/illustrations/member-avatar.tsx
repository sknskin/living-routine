// 구성원 아바타 일러스트 (SVG). 사용자 ID 로 머리 모양·색을 결정해 항상 같은 모습으로 그린다. 사진·개인정보 사용 없음.
// Member avatar illustration (SVG). Hair style/colors derive from the user id so each member looks consistent. No photos/PII.
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { useThemeColors } from '@/constants/theme';

const BACKGROUNDS = ['#FDE3D3', '#DDEFE3', '#E3EAFA', '#FFF0C7', '#EEE3F8', '#FCE1E8'];
const HAIR_COLORS = ['#3B2A20', '#5A3B26', '#1F1B18', '#7A4E2D', '#2E2622'];
const SKIN_TONES = ['#F6D2B8', '#EFC3A0', '#F9DCC6', '#E5B48F'];
const HAIR_STYLES = 3;
const VIEWBOX = 100;

// 문자열 → 안정적인 정수 해시
// String → stable integer hash
function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) >>> 0;
  }
  return result;
}

function pick<T>(list: T[], seed: number, salt: number): T {
  return list[(seed >>> salt) % list.length];
}

type Props = {
  seed: string;
  size?: number;
  label?: string;
  deleted?: boolean;
};

export function MemberAvatar({ seed, size = 48, label, deleted = false }: Props) {
  const colors = useThemeColors();
  const value = hash(seed);
  const bg = deleted ? colors.surfaceMuted : pick(BACKGROUNDS, value, 0);
  const hair = pick(HAIR_COLORS, value, 3);
  const skin = pick(SKIN_TONES, value, 6);
  const style = (value >>> 9) % HAIR_STYLES;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}>
      <Circle cx="50" cy="50" r="50" fill={bg} />
      {deleted ? (
        <Circle cx="50" cy="46" r="18" fill={colors.border} />
      ) : (
        <>
          {/* 몸 */}
          {/* Body */}
          <Path d="M20 100 C22 76 36 68 50 68 C64 68 78 76 80 100 Z" fill={pick(['#7FB89A', '#F2A98B', '#8EA9E6', '#E7C46A'], value, 12)} />
          {/* 목·얼굴 */}
          {/* Neck and face */}
          <Ellipse cx="50" cy="64" rx="8" ry="6" fill={skin} />
          <Circle cx="50" cy="46" r="20" fill={skin} />
          {/* 머리카락 */}
          {/* Hair */}
          {style === 0 ? <Path d="M29 44 C29 26 42 20 52 21 C66 22 72 32 71 44 C66 36 58 31 46 33 C38 34 33 38 29 44 Z" fill={hair} /> : null}
          {style === 1 ? (
            <Path d="M28 50 C25 30 38 20 51 20 C66 20 76 31 72 52 C70 42 66 35 58 33 C50 38 38 38 31 36 C29 40 28 45 28 50 Z" fill={hair} />
          ) : null}
          {style === 2 ? (
            <Path d="M27 60 C22 34 36 21 50 21 C66 21 78 34 73 60 C72 48 70 40 64 35 C56 39 42 39 35 35 C30 41 28 50 27 60 Z" fill={hair} />
          ) : null}
          {/* 눈·볼·입 */}
          {/* Eyes, cheeks, mouth */}
          <Circle cx="43" cy="48" r="2.2" fill="#2B2420" />
          <Circle cx="57" cy="48" r="2.2" fill="#2B2420" />
          <Circle cx="38" cy="55" r="3" fill="#F4A6A0" opacity={0.6} />
          <Circle cx="62" cy="55" r="3" fill="#F4A6A0" opacity={0.6} />
          <Path d="M45 56 Q50 60 55 56" stroke="#8A4B3C" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
