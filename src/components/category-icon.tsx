// 루틴 카테고리 아이콘 (파스텔 원형 배경)
// Routine category icon (pastel rounded background)
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Radius, useCategoryColors } from '@/constants/theme';
import { categoryOf } from '@/lib/routine-category';

// 아이콘 크기 비율
// Icon size ratio within the box
const ICON_RATIO = 0.55;

export function CategoryIcon({ title, size = 40 }: { title: string; size?: number }) {
  const category = categoryOf(title);
  const palette = useCategoryColors()[category.tone];
  return (
    <View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: Radius.md,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name={category.icon} size={size * ICON_RATIO} color={palette.fg} />
    </View>
  );
}
