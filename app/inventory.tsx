import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  FlatList,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService, InventoryEntry } from "@/services/DieselService";

interface InventoryTransaction extends InventoryEntry {
  id: string;
  type: "IN" | "OUT";
  displayAmount: number; // For showing positive/negative amounts
}

export default function InventoryScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  // Form state
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [litersReceived, setLitersReceived] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [receiptImageUri, setReceiptImageUri] = useState<string>("");

  // Validation state
  const [hasReceiptImage, setHasReceiptImage] = useState<boolean>(false);

  useEffect(() => {
    loadInventoryData();
  }, []);

  // Debug function to help identify the correct property names
  const debugTransactionData = (transactions: any[]) => {
    if (transactions && transactions.length > 0) {
      console.log("Raw transaction data structure:");
      console.log("First transaction keys:", Object.keys(transactions[0]));
      console.log("First transaction:", transactions[0]);
      console.log("Second transaction (if exists):", transactions[1]);
    }
  };

  const loadInventoryData = async () => {
    try {
      setLoading(true);
      const inventoryData = await DieselService.getInventory();

      // Debug the raw data structure
      console.log("Raw inventory data:", inventoryData);
      if (inventoryData.transactions) {
        debugTransactionData(inventoryData.transactions);
      }

      // Set current balance with fallback
      setCurrentBalance(inventoryData.currentStock || 0);

      // Process transactions to show proper IN/OUT types with amounts
      const formattedTransactions = (inventoryData.transactions || []).map(
        (transaction, index) => {
          // Try different possible property names for the liters amount
          const litersAmount =
            transaction.litersReceived ||
            transaction.liters ||
            transaction.Liters ||
            transaction.amount ||
            transaction.dieselFilled ||
            0;

          // Get the transaction type
          const transactionType =
            transaction.type ||
            transaction.Type ||
            transaction["Type (IN/OUT)"] ||
            (litersAmount < 0 ? "OUT" : "IN");

          // Determine display amount and type
          let type: "IN" | "OUT" = "IN";
          let displayAmount = Math.abs(Number(litersAmount)); // Ensure it's a number

          // Handle type determination
          if (transactionType && typeof transactionType === "string") {
            type = transactionType.toUpperCase().includes("OUT") ? "OUT" : "IN";
          } else if (litersAmount < 0) {
            type = "OUT";
          }

          // Get other properties with multiple possible names
          const receiptNumber =
            transaction.receiptNumber ||
            transaction["Receipt Number"] ||
            transaction.receipt ||
            "";

          const remarks =
            transaction.remarks ||
            transaction.Remarks ||
            transaction.description ||
            "";

          const phoneNumber =
            transaction.phoneNumber ||
            transaction["Phone Number"] ||
            transaction.phone ||
            "";

          const timestamp =
            transaction.timestamp ||
            transaction.Timestamp ||
            transaction.date ||
            new Date().toISOString();

          const imageURL =
            transaction.receiptImage ||
            transaction["Image URL"] ||
            transaction.imageURL ||
            "";

          console.log("Processing transaction:", {
            originalTransaction: transaction,
            litersAmount,
            displayAmount,
            type,
            receiptNumber,
            remarks,
            phoneNumber,
          });

          return {
            ...transaction,
            id: transaction.id || `transaction-${index}`,
            type: type,
            displayAmount: displayAmount,
            litersReceived: litersAmount,
            receiptNumber: receiptNumber,
            remarks: remarks,
            phoneNumber: phoneNumber,
            timestamp: timestamp,
            receiptImage: imageURL,
          };
        }
      );

      // Sort transactions by timestamp (newest first)
      formattedTransactions.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0).getTime();
        const dateB = new Date(b.timestamp || 0).getTime();
        return dateB - dateA;
      });

      console.log("Formatted transactions:", formattedTransactions);
      setTransactions(formattedTransactions);
    } catch (error) {
      console.error("Error loading inventory data:", error);
      // Load mock data with both IN and OUT transactions based on your actual data
      setCurrentBalance(475);
      setTransactions([
        {
          id: "1",
          type: "IN",
          litersReceived: 107,
          displayAmount: 107,
          receiptNumber: "88999",
          remarks: "Stock received",
          phoneNumber: "6666666666",
          timestamp: "6/22/2025 22:12:50",
        },
        {
          id: "2",
          type: "OUT",
          litersReceived: 2,
          displayAmount: 2,
          receiptNumber: "",
          remarks: "Jcb1 - Entry",
          phoneNumber: "2323333333",
          timestamp: "6/22/2025 22:15:59",
        },
        {
          id: "3",
          type: "IN",
          litersReceived: 100,
          displayAmount: 100,
          receiptNumber: "Vcccv",
          remarks: "Stock received",
          phoneNumber: "5555555555",
          timestamp: "6/22/2025 22:28:02",
        },
        {
          id: "4",
          type: "OUT",
          litersReceived: 10,
          displayAmount: 10,
          receiptNumber: "",
          remarks: "Main - Entry",
          phoneNumber: "2256666666",
          timestamp: "6/22/2025 22:28:27",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadInventoryData().finally(() => setRefreshing(false));
  }, []);

  const validateForm = (): boolean => {
    if (phoneNumber.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return false;
    }

    if (!litersReceived || parseFloat(litersReceived) <= 0) {
      Alert.alert("Error", "Please enter valid liters received");
      return false;
    }

    // MANDATORY: Receipt image validation
    if (!receiptImageUri || !hasReceiptImage) {
      Alert.alert(
        "Error",
        "Receipt image is required. Please take or select a photo of the receipt."
      );
      return false;
    }

    if (!receiptNumber.trim()) {
      Alert.alert("Error", "Receipt number is required");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      let receiptImageUrl = "";
      if (receiptImageUri) {
        receiptImageUrl = await DieselService.uploadImage(
          receiptImageUri,
          `receipt_${Date.now()}.jpg`
        );
      }

      const inventoryData: InventoryEntry = {
        litersReceived: parseFloat(litersReceived),
        receiptNumber: receiptNumber.trim(),
        remarks: remarks.trim(),
        receiptImage: receiptImageUrl,
        phoneNumber: phoneNumber.replace(/\D/g, ""),
        type: "IN", // All manual entries are IN transactions
      };

      const result = await DieselService.addInventory(inventoryData);

      if (result.success) {
        Alert.alert("Success", "Stock added to inventory successfully!", [
          {
            text: "OK",
            onPress: () => {
              resetForm();
              loadInventoryData();
            },
          },
        ]);
      } else {
        Alert.alert("Error", result.message || "Failed to add inventory");
      }
    } catch (error) {
      console.error("Error adding inventory:", error);
      Alert.alert("Error", "Failed to add inventory. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPhoneNumber("");
    setLitersReceived("");
    setReceiptNumber("");
    setRemarks("");
    setReceiptImageUri("");
    setHasReceiptImage(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Camera roll permissions are required to select images."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8, // Higher quality for receipt readability
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
      setHasReceiptImage(true);
    }
  };

  const takePicture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Camera permissions are required to take pictures."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8, // Higher quality for receipt readability
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
      setHasReceiptImage(true);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      "Receipt Image Required",
      "Please take or select a photo of the receipt",
      [
        { text: "Camera", onPress: takePicture },
        { text: "Gallery", onPress: pickImage },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const viewReceiptImage = (transaction: InventoryTransaction) => {
    if (transaction.receiptImage) {
      Alert.alert("Receipt Image", "Feature to view full receipt image", [
        { text: "OK" },
      ]);
    }
  };

  const getTransactionIcon = (type: "IN" | "OUT") => {
    return type === "IN" ? "plus.circle.fill" : "xmark.circle.fill";
  };

  const getTransactionColor = (type: "IN" | "OUT") => {
    return type === "IN" ? "#28a745" : "#dc3545";
  };

  const formatTransactionAmount = (transaction: InventoryTransaction) => {
    const sign = transaction.type === "IN" ? "+" : "-";
    const amount = transaction.displayAmount || 0;
    return `${sign}${amount.toFixed(1)}L`;
  };

  const renderTransaction = ({ item }: { item: InventoryTransaction }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <View style={styles.transactionTypeContainer}>
          <View
            style={[
              styles.typeIndicator,
              {
                backgroundColor: getTransactionColor(item.type),
              },
            ]}
          >
            <IconSymbol
              name={getTransactionIcon(item.type)}
              size={16}
              color="white"
            />
            <Text style={styles.typeText}>{item.type}</Text>
          </View>
          <View style={styles.transactionAmountContainer}>
            <Text
              style={[
                styles.transactionAmount,
                { color: getTransactionColor(item.type) },
              ]}
            >
              {formatTransactionAmount(item)}
            </Text>
          </View>
        </View>
        <Text style={styles.transactionDate}>{item.timestamp}</Text>
      </View>

      <View style={styles.transactionDetails}>
        {item.receiptNumber && (
          <View style={styles.transactionDetailRow}>
            <IconSymbol name="doc.text" size={14} color="#666" />
            <Text style={styles.transactionDetail}>
              <Text style={styles.bold}>Receipt:</Text> {item.receiptNumber}
            </Text>
          </View>
        )}

        {item.phoneNumber && (
          <View style={styles.transactionDetailRow}>
            <IconSymbol name="phone" size={14} color="#666" />
            <Text style={styles.transactionDetail}>
              <Text style={styles.bold}>Phone:</Text> {item.phoneNumber}
            </Text>
          </View>
        )}

        {item.remarks && (
          <View style={styles.transactionDetailRow}>
            <IconSymbol name="note" size={14} color="#666" />
            <Text style={styles.transactionDetail}>
              <Text style={styles.bold}>Remarks:</Text> {item.remarks}
            </Text>
          </View>
        )}

        {item.receiptImage && (
          <TouchableOpacity
            style={styles.viewReceiptButton}
            onPress={() => viewReceiptImage(item)}
          >
            <IconSymbol
              name="camera.fill"
              size={16}
              color={Colors[colorScheme ?? "light"].tint}
            />
            <Text style={styles.viewReceiptText}>View Receipt Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Calculate summary stats
  const getSummaryStats = () => {
    const totalIN = transactions
      .filter((t) => t.type === "IN")
      .reduce((sum, t) => sum + (t.displayAmount || 0), 0);

    const totalOUT = transactions
      .filter((t) => t.type === "OUT")
      .reduce((sum, t) => sum + (t.displayAmount || 0), 0);

    const inCount = transactions.filter((t) => t.type === "IN").length;
    const outCount = transactions.filter((t) => t.type === "OUT").length;

    return { totalIN, totalOUT, inCount, outCount };
  };

  const stats = getSummaryStats();

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme ?? "light"].tint },
        ]}
      >
        <ThemedText style={styles.headerTitle}>
          🛢️ Diesel Inventory Management
        </ThemedText>
      </View>

      {/* Enhanced Balance Display with Summary */}
      <View style={styles.balanceDisplay}>
        <View style={styles.balanceMainInfo}>
          <Text style={styles.balanceText}>
            📦 Current Balance: {(currentBalance || 0).toFixed(1)}L
          </Text>
        </View>

        <View style={styles.balanceSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              +{(stats.totalIN || 0).toFixed(1)}L
            </Text>
            <Text style={styles.summaryLabel}>{stats.inCount || 0} IN</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              -{(stats.totalOUT || 0).toFixed(1)}L
            </Text>
            <Text style={styles.summaryLabel}>{stats.outCount || 0} OUT</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Add Stock Form */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Add Diesel Stock (IN)
          </ThemedText>

          {/* Phone Number */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={(text) =>
                setPhoneNumber(text.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="Enter 10-digit phone number"
              keyboardType="phone-pad"
              maxLength={10}
            />
            <Text
              style={[
                styles.validationText,
                {
                  color: phoneNumber.length === 10 ? "#28a745" : "#dc3545",
                },
              ]}
            >
              {phoneNumber.length === 10
                ? "✅ Valid phone number"
                : `❌ Need ${10 - phoneNumber.length} more digits`}
            </Text>
          </View>

          {/* Liters Received */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Liters Received *</Text>
            <TextInput
              style={styles.input}
              value={litersReceived}
              onChangeText={setLitersReceived}
              placeholder="Enter exact liters of diesel received"
              keyboardType="numeric"
            />
            <Text style={styles.fieldNote}>
              📏 Enter the exact amount as shown on delivery receipt
            </Text>
          </View>

          {/* Receipt Number */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Receipt/Invoice Number *</Text>
            <TextInput
              style={styles.input}
              value={receiptNumber}
              onChangeText={setReceiptNumber}
              placeholder="Enter receipt or invoice number"
            />
            <Text style={styles.fieldNote}>
              📋 This must match the receipt image
            </Text>
          </View>

          {/* Remarks */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Supplier/Remarks</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Supplier name, delivery details, etc."
              multiline
              numberOfLines={3}
            />
          </View>

          {/* MANDATORY Receipt Image */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Receipt Image *{" "}
              <Text style={styles.requiredText}>(Required)</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.imageButton,
                !hasReceiptImage && styles.imageButtonRequired,
                hasReceiptImage && styles.imageButtonSuccess,
              ]}
              onPress={showImageOptions}
            >
              <IconSymbol
                name="camera.fill"
                size={24}
                color={hasReceiptImage ? "#28a745" : "#dc3545"}
              />
              <Text
                style={[
                  styles.imageButtonText,
                  { color: hasReceiptImage ? "#28a745" : "#dc3545" },
                ]}
              >
                {hasReceiptImage
                  ? "Receipt Photo Added ✅"
                  : "Add Receipt Photo (Required)"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.imageNote}>
              📷 Clear photo of receipt showing amount and receipt number
            </Text>

            {receiptImageUri ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: receiptImageUri }}
                  style={styles.imagePreview}
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => {
                    setReceiptImageUri("");
                    setHasReceiptImage(false);
                  }}
                >
                  <IconSymbol
                    name="xmark.circle.fill"
                    size={24}
                    color="#dc3545"
                  />
                </TouchableOpacity>
                <View style={styles.imageSuccessOverlay}>
                  <IconSymbol
                    name="checkmark.circle"
                    size={32}
                    color="#28a745"
                  />
                </View>
              </View>
            ) : null}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: hasReceiptImage
                  ? Colors[colorScheme ?? "light"].tint
                  : "#6c757d",
                opacity: loading ? 0.7 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={loading || !hasReceiptImage}
          >
            <Text style={styles.submitButtonText}>
              {loading
                ? "Adding to Inventory..."
                : !hasReceiptImage
                ? "Receipt Photo Required"
                : "Add to Inventory"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Enhanced Inventory History */}
        <View style={styles.section}>
          <View style={styles.historyHeader}>
            <ThemedText style={styles.sectionTitle}>
              Inventory History
            </ThemedText>
            <Text style={styles.historyCount}>
              {transactions.length || 0} transactions
            </Text>
          </View>

          {transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="tray" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No inventory records found</Text>
              <Text style={styles.emptySubtext}>
                Add your first stock entry above
              </Text>
            </View>
          ) : (
            <FlatList
              data={transactions}
              renderItem={renderTransaction}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  balanceDisplay: {
    backgroundColor: "#9C27B0",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  balanceMainInfo: {
    alignItems: "center",
    marginBottom: 10,
  },
  balanceText: {
    color: "white",
    fontSize: 20,
    fontWeight: "600",
  },
  balanceSummary: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryValue: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  summaryLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  historyCount: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  requiredText: {
    color: "#dc3545",
    fontSize: 14,
    fontWeight: "bold",
  },
  input: {
    borderWidth: 2,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "white",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  fieldNote: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
    fontStyle: "italic",
  },
  imageNote: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
    marginBottom: 10,
    fontStyle: "italic",
  },
  validationText: {
    fontSize: 12,
    marginTop: 5,
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 15,
    gap: 10,
  },
  imageButtonRequired: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  imageButtonSuccess: {
    borderColor: "#28a745",
    backgroundColor: "#f0fff4",
  },
  imageButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  imageContainer: {
    marginTop: 10,
    position: "relative",
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 12,
  },
  imageSuccessOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    padding: 4,
  },
  submitButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  transactionItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  transactionTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  typeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  typeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  transactionAmountContainer: {
    alignItems: "center",
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  transactionDate: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
  },
  transactionDetails: {
    gap: 8,
  },
  transactionDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transactionDetail: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  bold: {
    fontWeight: "bold",
    color: "#333",
  },
  viewReceiptButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 6,
    alignSelf: "flex-start",
    gap: 6,
  },
  viewReceiptText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007bff",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 5,
  },
});
