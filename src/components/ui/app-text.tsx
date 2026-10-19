// 테마 색·크기 변형을 가진 텍스트
// Text with theme color and size variants
import { Text, type TextProps } from 'react-native';

import { FontSize, useThemeColors } from '@/constants/theme';

type Variant = 'headline' | 'title' | 'body' | 'small' | 'caption';
type Tone = 'primary' | 'secondary' | 'accent' | 'danger' | 'warning' | 'onAccent' | 'onSelected';

type Props = TextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'bold';
};

const SIZE: Record<Variant, number> = {
  headline: FontSize.headline,
  title: FontSize.title,
  body: FontSize.body,
  small: FontSize.small,
  caption: FontSize.caption,
};

const WEIGHT = { regular: '400', medium: '500', bold: '700' } as const;

// 줄 높이 배율
// Line height multiplier
const LINE_HEIGHT_RATIO = 1.4;

export function AppText({ variant = 'body', tone = 'primary', weight, style, ...rest }: Props) {
  const colors = useThemeColors();
  const color = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    accent: colors.accent,
    danger: colors.danger,
    warning: colors.warning,
    onAccent: colors.onAccent,
    onSelected: colors.onSelected,
  }[tone];
  const resolvedWeight = weight ?? (variant === 'headline' || variant === 'title' ? 'bold' : 'regular');
  return (
    <Text
      // 큰 글꼴 설정 존중 (접근성)
      // Respect large font settings (accessibility)
      allowFontScaling
      style={[
        { color, fontSize: SIZE[variant], lineHeight: SIZE[variant] * LINE_HEIGHT_RATIO, fontWeight: WEIGHT[resolvedWeight] },
        style,
      ]}
      {...rest}
    />
  );
}
