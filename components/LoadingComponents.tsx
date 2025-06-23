// components/LoadingComponents.tsx
import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Dimensions,
  Animated,
} from "react-native";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const { width, height } = Dimensions.get("window");

interface LoadingState {
  isLoading: boolean;
  operation: string;
  progress?: number;
  message?: string;
  startTime?: number;
}

interface LoadingSpinnerProps {
  size?: "small" | "large";
  color?: string;
  message?: string;
}

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  progress?: number;
  operation?: string;
  onCancel?: () => void;
  cancellable?: boolean;
}

interface LoadingProgressProps {
  progress: number;
  message?: string;
  showPercentage?: boolean;
}

interface DataLoadingCardProps {
  title: string;
  isLoading: boolean;
  error?: string;
  data?: any;
  onRetry?: () => void;
  children?: React.ReactNode;
}

interface LoadingListItemProps {
  isLoading: boolean;
  height?: number;
  lines?: number;
}

// Basic Loading Spinner
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "small",
  color,
  message,
}) => {
  const colorScheme = useColorScheme();
  const spinnerColor = color || Colors[colorScheme ?? "light"].tint;

  return (
    <View style={styles.spinnerContainer}>
      <ActivityIndicator
        size={size}
        color={spinnerColor}
        style={styles.spinner}
      />
      {message && (
        <Text style={[styles.spinnerMessage, { color: spinnerColor }]}>
          {message}
        </Text>
      )}
    </View>
  );
};

// Full Screen Loading Overlay
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message = "Loading...",
  progress,
  operation,
  onCancel,
  cancellable = false,
}) => {
  const colorScheme = useColorScheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancellable ? onCancel : undefined}
    >
      <View style={styles.overlayContainer}>
        <View style={styles.overlayContent}>
          {/* App branding */}
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>🏗️ Diesel Tracker Pro</Text>
          </View>

          {/* Loading animation */}
          <View style={styles.overlayLoading}>
            <ActivityIndicator
              size="large"
              color={Colors[colorScheme ?? "light"].tint}
              style={styles.overlaySpinner}
            />

            {operation && (
              <Text style={styles.overlayOperation}>
                {operation.charAt(0).toUpperCase() + operation.slice(1)}
              </Text>
            )}

            <Text style={styles.overlayMessage}>{message}</Text>

            {progress !== undefined && (
              <LoadingProgress progress={progress} showPercentage={true} />
            )}
          </View>

          {/* Cancel button if applicable */}
          {cancellable && onCancel && (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Progress Bar Component
export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  message,
  showPercentage = false,
}) => {
  const progressValue = Math.min(Math.max(progress, 0), 100);

  return (
    <View style={styles.progressContainer}>
      {message && <Text style={styles.progressMessage}>{message}</Text>}

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressValue}%` }]} />
      </View>

      {showPercentage && (
        <Text style={styles.progressText}>{Math.round(progressValue)}%</Text>
      )}
    </View>
  );
};

// Data Loading Card with States
export const DataLoadingCard: React.FC<DataLoadingCardProps> = ({
  title,
  isLoading,
  error,
  data,
  onRetry,
  children,
}) => {
  const colorScheme = useColorScheme();

  return (
    <View style={styles.dataCard}>
      <View style={styles.dataCardHeader}>
        <Text style={styles.dataCardTitle}>{title}</Text>

        {isLoading && (
          <ActivityIndicator
            size="small"
            color={Colors[colorScheme ?? "light"].tint}
          />
        )}

        {error && !isLoading && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <IconSymbol name="refresh" size={16} color="#dc3545" />
          </TouchableOpacity>
        )}

        {!isLoading && !error && data && (
          <IconSymbol name="checkmark.circle" size={16} color="#28a745" />
        )}
      </View>

      <View style={styles.dataCardContent}>
        {isLoading ? (
          <View style={styles.dataCardLoading}>
            <LoadingSpinner message="Loading data..." />
          </View>
        ) : error ? (
          <View style={styles.dataCardError}>
            <IconSymbol name="warning" size={24} color="#dc3545" />
            <Text style={styles.errorText}>{error}</Text>
            {onRetry && (
              <TouchableOpacity
                style={styles.retryButtonFull}
                onPress={onRetry}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          children
        )}
      </View>
    </View>
  );
};

// Skeleton Loading for List Items
export const LoadingListItem: React.FC<LoadingListItemProps> = ({
  isLoading,
  height = 80,
  lines = 2,
}) => {
  if (!isLoading) return null;

  return (
    <View style={[styles.skeletonItem, { height }]}>
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonText}>
          {Array.from({ length: lines }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.skeletonLine,
                {
                  width: index === lines - 1 ? "60%" : "100%",
                  marginBottom: index === lines - 1 ? 0 : 8,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

// Connection Status Indicator
interface ConnectionStatusProps {
  isConnected: boolean;
  isLoading: boolean;
  lastUpdate?: string;
  onRefresh?: () => void;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isLoading,
  lastUpdate,
  onRefresh,
}) => {
  const colorScheme = useColorScheme();

  const getStatusColor = () => {
    if (isLoading) return "#ffc107";
    return isConnected ? "#28a745" : "#dc3545";
  };

  const getStatusIcon = () => {
    if (isLoading) return "clock";
    return isConnected ? "checkmark.circle" : "xmark.circle.fill";
  };

  const getStatusText = () => {
    if (isLoading) return "Checking...";
    return isConnected ? "Connected" : "Offline";
  };

  return (
    <TouchableOpacity
      style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]}
      onPress={onRefresh}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="white" />
      ) : (
        <IconSymbol name={getStatusIcon()} size={16} color="white" />
      )}

      <Text style={styles.statusText}>{getStatusText()}</Text>

      {lastUpdate && !isLoading && (
        <Text style={styles.statusTime}>
          {new Date(lastUpdate).toLocaleTimeString()}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// Form Loading States
interface FormLoadingProps {
  isSubmitting: boolean;
  operation: string;
  progress?: number;
}

export const FormLoadingIndicator: React.FC<FormLoadingProps> = ({
  isSubmitting,
  operation,
  progress,
}) => {
  if (!isSubmitting) return null;

  return (
    <View style={styles.formLoading}>
      <ActivityIndicator size="small" color="#007bff" />
      <Text style={styles.formLoadingText}>{operation}...</Text>
      {progress !== undefined && (
        <Text style={styles.formLoadingProgress}>{Math.round(progress)}%</Text>
      )}
    </View>
  );
};

// Success/Error Acknowledgment
interface AcknowledgmentProps {
  visible: boolean;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  onClose: () => void;
  autoHide?: boolean;
  duration?: number;
}

export const AcknowledgmentModal: React.FC<AcknowledgmentProps> = ({
  visible,
  type,
  title,
  message,
  onClose,
  autoHide = true,
  duration = 3000,
}) => {
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    if (visible && autoHide) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, autoHide, duration, onClose]);

  const getTypeConfig = () => {
    switch (type) {
      case "success":
        return {
          color: "#28a745",
          icon: "checkmark.circle",
          emoji: "✅",
        };
      case "error":
        return {
          color: "#dc3545",
          icon: "xmark.circle.fill",
          emoji: "❌",
        };
      case "warning":
        return {
          color: "#ffc107",
          icon: "warning",
          emoji: "⚠️",
        };
      case "info":
        return {
          color: "#17a2b8",
          icon: "info.circle",
          emoji: "ℹ️",
        };
    }
  };

  const config = getTypeConfig();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.acknowledgmentOverlay}>
        <View
          style={[styles.acknowledgmentContent, { borderColor: config.color }]}
        >
          <View
            style={[
              styles.acknowledgmentHeader,
              { backgroundColor: config.color },
            ]}
          >
            <Text style={styles.acknowledgmentEmoji}>{config.emoji}</Text>
            <Text style={styles.acknowledgmentTitle}>{title}</Text>
          </View>

          <View style={styles.acknowledgmentBody}>
            <Text style={styles.acknowledgmentMessage}>{message}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.acknowledgmentButton,
              { backgroundColor: config.color },
            ]}
            onPress={onClose}
          >
            <Text style={styles.acknowledgmentButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Basic Spinner
  spinnerContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  spinner: {
    marginBottom: 10,
  },
  spinnerMessage: {
    fontSize: 14,
    textAlign: "center",
  },

  // Loading Overlay
  overlayContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    minWidth: width * 0.8,
    maxWidth: width * 0.9,
  },
  overlayHeader: {
    marginBottom: 30,
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  overlayLoading: {
    alignItems: "center",
    marginBottom: 20,
  },
  overlaySpinner: {
    marginBottom: 20,
  },
  overlayOperation: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  overlayMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  cancelButton: {
    backgroundColor: "#6c757d",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },

  // Progress Bar
  progressContainer: {
    width: "100%",
    alignItems: "center",
  },
  progressMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#e9ecef",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007bff",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
  },

  // Data Loading Card
  dataCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dataCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dataCardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  dataCardContent: {
    minHeight: 40,
  },
  dataCardLoading: {
    alignItems: "center",
    paddingVertical: 20,
  },
  dataCardError: {
    alignItems: "center",
    paddingVertical: 20,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 14,
    textAlign: "center",
    marginVertical: 10,
  },
  retryButton: {
    padding: 8,
    borderRadius: 4,
  },
  retryButtonFull: {
    backgroundColor: "#dc3545",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  retryButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  // Skeleton Loading
  skeletonItem: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginVertical: 4,
  },
  skeletonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e9ecef",
    marginRight: 12,
  },
  skeletonText: {
    flex: 1,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: "#e9ecef",
    borderRadius: 6,
  },

  // Connection Status
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  statusTime: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 10,
  },

  // Form Loading
  formLoading: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginVertical: 8,
    gap: 10,
  },
  formLoadingText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  formLoadingProgress: {
    fontSize: 12,
    color: "#007bff",
    fontWeight: "600",
  },

  // Acknowledgment Modal
  acknowledgmentOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  acknowledgmentContent: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 2,
    overflow: "hidden",
    minWidth: width * 0.8,
    maxWidth: width * 0.9,
  },
  acknowledgmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  acknowledgmentEmoji: {
    fontSize: 24,
  },
  acknowledgmentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    flex: 1,
  },
  acknowledgmentBody: {
    padding: 20,
  },
  acknowledgmentMessage: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    textAlign: "center",
  },
  acknowledgmentButton: {
    margin: 20,
    marginTop: 0,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  acknowledgmentButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
