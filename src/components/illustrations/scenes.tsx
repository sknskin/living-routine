// 장면 일러스트 (SVG): 함께(두 사람+하트), 완료(체크+반짝임), 빈 상태(집+화분), 로고 마크(집+하트)
// Scene illustrations (SVG): together (two people + heart), completion (check + sparkles), empty (house + plant), logo (house + heart)
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useThemeColors } from '@/constants/theme';

const SKIN_A = '#F6D2B8';
const SKIN_B = '#EFC3A0';
const HAIR_A = '#3B2A20';
const HAIR_B = '#5A3B26';

type SizeProps = { size?: number; label?: string };

function a11y(label?: string) {
  return label ? { accessibilityLabel: label, accessibilityRole: 'image' as const } : {};
}

// 하트 경로 (중심 cx, cy, 크기 s)
// Heart path centered at (cx, cy) with size s
function heartPath(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + s * 0.9} C${cx - s * 1.4} ${cy} ${cx - s} ${cy - s * 0.9} ${cx} ${cy - s * 0.35} C${cx + s} ${cy - s * 0.9} ${cx + s * 1.4} ${cy} ${cx} ${cy + s * 0.9} Z`;
}

export function HeartIcon({ size = 18, color }: { size?: number; color?: string }) {
  const colors = useThemeColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={heartPath(12, 12, 9)} fill={color ?? colors.heart} />
    </Svg>
  );
}

export function TogetherIllustration({ size = 160, label }: SizeProps) {
  const colors = useThemeColors();
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 160 120" {...a11y(label)}>
      <Circle cx="80" cy="66" r="52" fill={colors.warm} />
      {/* 왼쪽 사람 */}
      {/* Left person */}
      <Path d="M28 120 C30 92 42 84 56 84 C70 84 80 92 82 120 Z" fill="#F2A98B" />
      <Circle cx="56" cy="62" r="18" fill={SKIN_A} />
      <Path d="M37 66 C33 42 48 38 56 38 C70 38 78 48 75 66 C74 56 70 50 62 48 C54 52 44 52 40 50 C38 56 37 60 37 66 Z" fill={HAIR_A} />
      <Circle cx="50" cy="64" r="1.8" fill="#2B2420" />
      <Circle cx="62" cy="64" r="1.8" fill="#2B2420" />
      <Path d="M52 71 Q56 74 60 71" stroke="#8A4B3C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* 오른쪽 사람 */}
      {/* Right person */}
      <Path d="M78 120 C80 92 92 84 106 84 C120 84 130 92 132 120 Z" fill="#7FB89A" />
      <Circle cx="106" cy="62" r="18" fill={SKIN_B} />
      <Path d="M89 60 C88 44 98 40 107 40 C118 40 125 47 124 60 C119 52 112 49 104 50 C97 51 92 55 89 60 Z" fill={HAIR_B} />
      <Circle cx="100" cy="64" r="1.8" fill="#2B2420" />
      <Circle cx="112" cy="64" r="1.8" fill="#2B2420" />
      <Path d="M102 71 Q106 74 110 71" stroke="#8A4B3C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* 하트 */}
      {/* Heart */}
      <Path d={heartPath(81, 98, 9)} fill={colors.heart} />
    </Svg>
  );
}

export function CompletionIllustration({ size = 120, label }: SizeProps) {
  const colors = useThemeColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" {...a11y(label)}>
      <Circle cx="60" cy="60" r="44" fill={colors.accentSoft} />
      <Circle cx="60" cy="60" r="32" fill={colors.surface} stroke={colors.accent} strokeWidth="4" />
      <Path d="M46 61 L56 71 L75 50" stroke={colors.accent} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* 반짝임 */}
      {/* Sparkles */}
      <Path d="M18 28 L21 34 L27 37 L21 40 L18 46 L15 40 L9 37 L15 34 Z" fill="#F2C14E" />
      <Path d="M100 18 L102 22 L106 24 L102 26 L100 30 L98 26 L94 24 L98 22 Z" fill="#F2C14E" />
      <Circle cx="104" cy="88" r="4" fill={colors.heart} />
      <Circle cx="22" cy="90" r="3" fill="#8EA9E6" />
    </Svg>
  );
}

export function EmptyHomeIllustration({ size = 140, label }: SizeProps) {
  const colors = useThemeColors();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 140 112" {...a11y(label)}>
      <Circle cx="70" cy="60" r="50" fill={colors.warm} />
      {/* 집 */}
      {/* House */}
      <Path d="M36 58 L70 30 L104 58 Z" fill="#F2A98B" />
      <Rect x="44" y="56" width="52" height="38" rx="4" fill={colors.surface} stroke={colors.border} strokeWidth="2" />
      <Rect x="64" y="72" width="14" height="22" rx="3" fill="#7FB89A" />
      <Rect x="50" y="64" width="10" height="10" rx="2" fill="#E3ECFA" />
      {/* 화분 */}
      {/* Plant */}
      <Rect x="106" y="80" width="14" height="14" rx="3" fill="#D99B6C" />
      <Path d="M113 80 C110 70 104 68 102 64 C108 64 112 68 113 74 C114 66 118 62 124 62 C122 68 116 72 113 80 Z" fill="#5FA67F" />
      <Path d={heartPath(70, 44, 5)} fill={colors.heart} />
    </Svg>
  );
}

export function LogoMark({ size = 40, label }: SizeProps) {
  const colors = useThemeColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" {...a11y(label)}>
      <Rect x="0" y="0" width="48" height="48" rx="14" fill={colors.warm} />
      <Path d="M10 24 L24 12 L38 24 L38 37 C38 38.5 36.5 40 35 40 L13 40 C11.5 40 10 38.5 10 37 Z" fill="#F2A98B" />
      <Path d={heartPath(24, 28, 6)} fill={colors.surface} />
    </Svg>
  );
}
