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
}

export default function InventoryScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  // Form state
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [litersReceived, setLitersReceived] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [receiptImageUri, setReceiptImageUri] = useState<string>("");

  useEffect(() => {
    loadInventoryData();
  }, []);

  const loadInventoryData = async () => {
    try {
      setLoading(true);
      const inventoryData = await DieselService.getInventory();

      setCurrentBalance(inventoryData.currentStock);

      // Convert transactions to display format
      const formattedTransactions = inventoryData.transactions.map(
        (transaction, index) => ({
          ...transaction,
          id: `transaction-${index}`,
          type: "IN" as "IN" | "OUT",
        })
      );

      setTransactions(formattedTransactions);
    } catch (error) {
      console.error("Error loading inventory data:", error);
      // Load mock data
      setCurrentBalance(475);
      setTransactions([
        {
          id: "1",
          type: "IN",
          litersReceived: 500,
          receiptNumber: "RCP001",
          remarks: "Initial stock",
          phoneNumber: "9876543210",
          timestamp: new Date().toLocaleString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (phoneNumber.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return false;
    }

    if (!litersReceived || parseFloat(litersReceived) <= 0) {
      Alert.alert("Error", "Please enter valid liters received");
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
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
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
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert("Select Receipt Image", "Choose how to add receipt image", [
      { text: "Camera", onPress: takePicture },
      { text: "Gallery", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderTransaction = ({ item }: { item: InventoryTransaction }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <View
          style={[
            styles.typeIndicator,
            {
              backgroundColor: item.type === "IN" ? "#28a745" : "#dc3545",
            },
          ]}
        >
          <Text style={styles.typeText}>
            {item.type === "IN" ? "➕ IN" : "➖ OUT"}
          </Text>
        </View>
        <Text style={styles.transactionDate}>{item.timestamp}</Text>
      </View>

      <View style={styles.transactionDetails}>
        <Text style={styles.transactionAmount}>
          {item.type === "IN" ? "+" : "-"}
          {item.litersReceived}L
        </Text>

        {item.receiptNumber && (
          <Text style={styles.transactionDetail}>
            <Text style={styles.bold}>Receipt:</Text> {item.receiptNumber}
          </Text>
        )}

        {item.phoneNumber && (
          <Text style={styles.transactionDetail}>
            <Text style={styles.bold}>Phone:</Text> {item.phoneNumber}
          </Text>
        )}

        {item.remarks && (
          <Text style={styles.transactionDetail}>
            <Text style={styles.bold}>Remarks:</Text> {item.remarks}
          </Text>
        )}

        {item.receiptImage && (
          <TouchableOpacity style={styles.viewReceiptButton}>
            <IconSymbol
              name="doc.text"
              size={16}
              color={Colors[colorScheme ?? "light"].tint}
            />
            <Text style={styles.viewReceiptText}>View Receipt</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

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

      {/* Current Balance Display */}
      <View style={styles.balanceDisplay}>
        <Text style={styles.balanceText}>
          📦 Current Balance: {currentBalance.toFixed(1)}L
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Add Stock Form */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Add Diesel Stock</ThemedText>

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
              placeholder="Enter liters of diesel received"
              keyboardType="numeric"
            />
          </View>

          {/* Receipt Number */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Receipt Number</Text>
            <TextInput
              style={styles.input}
              value={receiptNumber}
              onChangeText={setReceiptNumber}
              placeholder="Enter receipt/invoice number"
            />
          </View>

          {/* Remarks */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Remarks (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add any notes about this stock entry"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Receipt Image */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Receipt Image (Optional)</Text>
            <TouchableOpacity
              style={styles.imageButton}
              onPress={showImageOptions}
            >
              <IconSymbol
                name="camera.fill"
                size={24}
                color={Colors[colorScheme ?? "light"].tint}
              />
              <Text style={styles.imageButtonText}>Add Receipt Image</Text>
            </TouchableOpacity>

            {receiptImageUri ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: receiptImageUri }}
                  style={styles.imagePreview}
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setReceiptImageUri("")}
                >
                  <IconSymbol
                    name="xmark.circle.fill"
                    size={24}
                    color="#dc3545"
                  />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: Colors[colorScheme ?? "light"].tint,
                opacity: loading ? 0.7 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? "Adding to Inventory..." : "Add to Inventory"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Inventory History */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Inventory History</ThemedText>

          {transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="tray" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No inventory records found</Text>
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
    alignItems: "center",
  },
  balanceText: {
    color: "white",
    fontSize: 20,
    fontWeight: "600",
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
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
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
    alignItems: "center",
    marginBottom: 10,
  },
  typeIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  transactionDate: {
    fontSize: 12,
    color: "#666",
  },
  transactionDetails: {
    gap: 5,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  transactionDetail: {
    fontSize: 14,
    color: "#666",
  },
  bold: {
    fontWeight: "bold",
    color: "#333",
  },
  viewReceiptButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 5,
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
  },
});
