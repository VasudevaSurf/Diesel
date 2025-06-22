import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<
  SymbolViewProps["name"],
  ComponentProps<typeof MaterialIcons>["name"]
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // Original mappings
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",

  // New mappings for Diesel Tracker Pro
  "plus.circle.fill": "add-circle",
  "cylinder.fill": "local-gas-station",
  "chart.bar.fill": "bar-chart",
  "gear.circle.fill": "settings",
  "camera.fill": "camera-alt",
  "xmark.circle.fill": "cancel",
  magnifyingglass: "search",
  xmark: "close",
  "square.and.arrow.up": "share",
  tray: "inbox",
  "doc.text": "description",
  "plus.circle": "add-circle-outline",
  gear: "settings",
  clock: "schedule",
  "wrench.and.screwdriver": "build",
  qrcode: "qr-code",
  trash: "delete",

  // Alert-specific icons
  warning: "warning",
  "exclamation.triangle": "warning",
  "checkmark.circle": "check-circle",
  "pause-circle": "pause-circle-outline",
  "trending-down": "trending-down",
  "trending-up": "trending-up",
  timer: "timer",
  hourglass: "hourglass-empty",

  // Additional utility icons
  refresh: "refresh",
  filter: "filter-list",
  "arrow.up.circle": "keyboard-arrow-up",
  "arrow.down.circle": "keyboard-arrow-down",
  "info.circle": "info",
  "bell.fill": "notifications",
  bell: "notifications-none",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
