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
  Dimensions,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService, Machine } from "@/services/DieselService";
import { Picker } from "@react-native-picker/picker";

const { width } = Dimensions.get("window");

export default function DieselEntryScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number>(0);

  // Form state
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [lastReading, setLastReading] = useState<string>("");
  const [currentReading, setCurrentReading] = useState<string>("");
  const [dieselFilled, setDieselFilled] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [usage, setUsage] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [selectedMachineData, setSelectedMachineData] =
    useState<Machine | null>(null);
  const [imageUri, setImageUri] = useState<string>("");
  const [alertMessage, setAlertMessage] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [machinesData, inventoryData] = await Promise.all([
        DieselService.getMachines(),
        DieselService.getInventory(),
      ]);

      setMachines(machinesData);
      setCurrentBalance(inventoryData.currentStock || 0);
    } catch (error) {
      console.error("Error loading data:", error);
      // Load mock data
      setMachines([
        {
          name: "JCB-12",
          plate: "AP09AB1234",
          lastReading: 1250.5,
          machineType: "L/hr",
          ownershipType: "Rental",
          standardAvgDiesel: 4.0,
          expectedDailyHours: 8.0,
        },
        {
          name: "CAT-09",
          plate: "TN10CD5678",
          lastReading: 890.2,
          machineType: "L/hr",
          ownershipType: "Own",
          standardAvgDiesel: 3.5,
          expectedDailyHours: 6.0,
        },
      ]);
      setCurrentBalance(475);
    } finally {
      setLoading(false);
    }
  };

  const handleMachineChange = (machineName: string) => {
    setSelectedMachine(machineName);
    const machine = machines.find((m) => m.name === machineName);
    setSelectedMachineData(machine || null);

    if (machine) {
      setLastReading(machine.lastReading?.toString() || "0");
      calculateUsageAndRate(
        machine.lastReading || 0,
        parseFloat(currentReading) || 0,
        parseFloat(dieselFilled) || 0,
        machine
      );
    } else {
      setLastReading("");
      setUsage("");
      setRate("");
      setAlertMessage("");
    }
  };

  const calculateUsageAndRate = (
    lastRead: number,
    currentRead: number,
    diesel: number,
    machine?: Machine
  ) => {
    const usageCalc = Math.max(0, currentRead - lastRead);
    setUsage(usageCalc.toFixed(1));

    let rateCalc = 0;
    const machineData = machine || selectedMachineData;

    if (machineData) {
      if (machineData.machineType === "KM/l") {
        rateCalc = diesel > 0 ? usageCalc / diesel : 0;
      } else {
        rateCalc = usageCalc > 0 ? diesel / usageCalc : 0;
      }
    }

    setRate(rateCalc.toFixed(2));

    // Check for alerts
    if (machineData && usageCalc > 0 && diesel > 0) {
      checkForAlerts(machineData, rateCalc, usageCalc);
    } else {
      setAlertMessage("");
    }
  };

  const checkForAlerts = (
    machine: Machine,
    calculatedRate: number,
    calculatedUsage: number
  ) => {
    const standardAvg = machine.standardAvgDiesel || 0;
    const expectedDaily = machine.expectedDailyHours || 0;

    let alerts: string[] = [];

    // Over consumption check
    if (standardAvg > 0) {
      if (
        machine.machineType === "KM/l" &&
        calculatedRate < standardAvg * 0.8
      ) {
        const efficiency = (
          ((standardAvg - calculatedRate) / standardAvg) *
          100
        ).toFixed(1);
        alerts.push(
          `⚠️ Low fuel efficiency! Expected: ${standardAvg.toFixed(
            2
          )} KM/l, Actual: ${calculatedRate.toFixed(
            2
          )} KM/l, ${efficiency}% below standard.`
        );
      } else if (
        machine.machineType === "L/hr" &&
        calculatedRate > standardAvg
      ) {
        const mismatch = calculatedRate - standardAvg;
        alerts.push(
          `⚠️ Over consumption detected! Standard: ${standardAvg.toFixed(
            2
          )} L/hr, Actual: ${calculatedRate.toFixed(
            2
          )} L/hr, Excess: +${mismatch.toFixed(2)} L/hr.`
        );
      }
    }

    // Idle machine check
    if (
      machine.machineType === "L/hr" &&
      expectedDaily > 0 &&
      calculatedUsage < expectedDaily * 0.7
    ) {
      alerts.push(
        `💤 Machine appears idle! Expected: ${expectedDaily} hrs, Actual: ${calculatedUsage.toFixed(
          1
        )} hrs.`
      );
    }

    setAlertMessage(alerts.join(" "));
  };

  const handleCurrentReadingChange = (value: string) => {
    setCurrentReading(value);
    const currentRead = parseFloat(value) || 0;
    const lastRead = parseFloat(lastReading) || 0;
    const diesel = parseFloat(dieselFilled) || 0;

    if (currentRead > 0 && currentRead <= lastRead) {
      Alert.alert(
        "Invalid Reading",
        "Current reading must be greater than last reading!"
      );
      return;
    }

    calculateUsageAndRate(lastRead, currentRead, diesel);
  };

  const handleDieselFilledChange = (value: string) => {
    setDieselFilled(value);
    const diesel = parseFloat(value) || 0;

    if (diesel > currentBalance) {
      Alert.alert(
        "Insufficient Stock",
        `Requested diesel (${diesel}L) exceeds current stock (${currentBalance}L).`
      );
    }

    const currentRead = parseFloat(currentReading) || 0;
    const lastRead = parseFloat(lastReading) || 0;
    calculateUsageAndRate(lastRead, currentRead, diesel);
  };

  const validateForm = (): boolean => {
    if (!selectedMachine) {
      Alert.alert("Error", "Please select a machine");
      return false;
    }

    if (phoneNumber.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return false;
    }

    if (
      !currentReading ||
      parseFloat(currentReading) <= parseFloat(lastReading)
    ) {
      Alert.alert("Error", "Current reading must be greater than last reading");
      return false;
    }

    if (!dieselFilled || parseFloat(dieselFilled) <= 0) {
      Alert.alert("Error", "Please enter diesel filled amount");
      return false;
    }

    if (!remarks.trim()) {
      Alert.alert("Error", "Please enter remarks/chainage");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      const entryData = {
        machineName: selectedMachine,
        startReading: parseFloat(lastReading) || 0,
        endReading: parseFloat(currentReading) || 0,
        dieselFilled: parseFloat(dieselFilled) || 0,
        remarks: remarks,
        phoneNumber: phoneNumber.replace(/\D/g, ""),
        imageURL: imageUri || "",
      };

      const result = await DieselService.submitEntry(entryData);

      if (result.success) {
        Alert.alert("Success", "Diesel entry submitted successfully!", [
          {
            text: "OK",
            onPress: () => {
              // Reset form
              resetForm();
              loadData(); // Reload data
            },
          },
        ]);
      } else {
        Alert.alert("Error", result.message || "Failed to submit entry");
      }
    } catch (error) {
      console.error("Error submitting entry:", error);
      Alert.alert("Error", "Failed to submit entry. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedMachine("");
    setPhoneNumber("");
    setLastReading("");
    setCurrentReading("");
    setDieselFilled("");
    setRemarks("");
    setUsage("");
    setRate("");
    setSelectedMachineData(null);
    setImageUri("");
    setAlertMessage("");
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
      setImageUri(result.assets[0].uri);
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
      setImageUri(result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert("Select Image", "Choose how to add an image", [
      { text: "Camera", onPress: takePicture },
      { text: "Gallery", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const generateMachineId = (machine: Machine) => {
    return `${machine.name}-${machine.plate}`;
  };

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
          📝 Daily Diesel Entry
        </ThemedText>
      </View>

      {/* Current Stock Display */}
      <View style={styles.inventoryDisplay}>
        <Text style={styles.inventoryText}>
          📦 Current Stock: {currentBalance.toFixed(1)}L
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Machine Selection */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Select Machine *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedMachine}
              onValueChange={handleMachineChange}
              style={styles.picker}
            >
              <Picker.Item label="-- Select Machine --" value="" />
              {machines.map((machine, index) => (
                <Picker.Item
                  key={index}
                  label={`${generateMachineId(machine)} (${
                    machine.ownershipType || "Own"
                  }) - ${machine.machineType || "L/hr"}`}
                  value={machine.name}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Machine Info Card */}
        {selectedMachineData && (
          <View style={styles.machineCard}>
            <View style={styles.machineCardHeader}>
              <Text style={styles.machineId}>
                {generateMachineId(selectedMachineData)}
              </Text>
              <View style={styles.badgeContainer}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        selectedMachineData.ownershipType === "Rental"
                          ? "#ffeaa7"
                          : "#81ecec",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color:
                          selectedMachineData.ownershipType === "Rental"
                            ? "#d63031"
                            : "#00b894",
                      },
                    ]}
                  >
                    {selectedMachineData.ownershipType || "Own"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        selectedMachineData.machineType === "KM/l"
                          ? "#fd79a8"
                          : "#74b9ff",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color:
                          selectedMachineData.machineType === "KM/l"
                            ? "#e84393"
                            : "#0984e3",
                      },
                    ]}
                  >
                    {selectedMachineData.machineType || "L/hr"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.machineInfo}>
              <Text style={styles.machineInfoText}>
                <Text style={styles.bold}>Standard Avg:</Text>{" "}
                {selectedMachineData.standardAvgDiesel || "N/A"}{" "}
                {selectedMachineData.machineType || "L/hr"}
              </Text>
              <Text style={styles.machineInfoText}>
                <Text style={styles.bold}>Expected Daily:</Text>{" "}
                {selectedMachineData.expectedDailyHours || "N/A"} hrs
              </Text>
            </View>
          </View>
        )}

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
              { color: phoneNumber.length === 10 ? "#28a745" : "#dc3545" },
            ]}
          >
            {phoneNumber.length === 10
              ? "✅ Valid phone number"
              : `❌ Need ${10 - phoneNumber.length} more digits`}
          </Text>
        </View>

        {/* Readings */}
        <View style={styles.formRow}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "Last KM Reading"
                : "Last Engine Reading"}
            </Text>
            <TextInput
              style={[styles.input, styles.readonlyInput]}
              value={lastReading}
              editable={false}
            />
          </View>

          <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "Current KM Reading"
                : "Current Engine Reading"}
            </Text>
            <TextInput
              style={styles.input}
              value={currentReading}
              onChangeText={handleCurrentReadingChange}
              placeholder="Enter current reading"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Diesel and Usage */}
        <View style={styles.formRow}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Diesel Filled (Liters) *</Text>
            <TextInput
              style={styles.input}
              value={dieselFilled}
              onChangeText={handleDieselFilledChange}
              placeholder="Enter diesel amount"
              keyboardType="numeric"
            />
          </View>

          <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "Kilometers Traveled"
                : "Hours Worked"}
            </Text>
            <TextInput
              style={[styles.input, styles.readonlyInput]}
              value={usage}
              editable={false}
            />
          </View>
        </View>

        {/* Rate and Remarks */}
        <View style={styles.formRow}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "KM/l Rate"
                : "L/hr Rate"}
            </Text>
            <TextInput
              style={[styles.input, styles.readonlyInput]}
              value={rate}
              editable={false}
            />
          </View>

          <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>Remarks/Chainage *</Text>
            <TextInput
              style={styles.input}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="At which chainage/location?"
            />
          </View>
        </View>

        {/* Alert Warning */}
        {alertMessage ? (
          <View style={styles.alertContainer}>
            <Text style={styles.alertText}>{alertMessage}</Text>
          </View>
        ) : null}

        {/* Image Upload */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Engine Reading Image (Optional)</Text>
          <TouchableOpacity
            style={styles.imageButton}
            onPress={showImageOptions}
          >
            <IconSymbol
              name="camera.fill"
              size={24}
              color={Colors[colorScheme ?? "light"].tint}
            />
            <Text style={styles.imageButtonText}>Add Image</Text>
          </TouchableOpacity>

          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setImageUri("")}
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
              backgroundColor:
                currentBalance <= 0
                  ? "#6c757d"
                  : Colors[colorScheme ?? "light"].tint,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={loading || currentBalance <= 0}
        >
          <Text style={styles.submitButtonText}>
            {loading
              ? "Submitting..."
              : currentBalance <= 0
              ? "No Diesel Available"
              : "Submit Entry"}
          </Text>
        </TouchableOpacity>
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
  inventoryDisplay: {
    backgroundColor: "#9C27B0",
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: "center",
  },
  inventoryText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    flexDirection: "row",
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
  readonlyInput: {
    backgroundColor: "#f8f9fa",
    color: "#6c757d",
  },
  pickerContainer: {
    borderWidth: 2,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    backgroundColor: "white",
  },
  picker: {
    height: 50,
  },
  machineCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  machineCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  machineId: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  machineInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  machineInfoText: {
    fontSize: 14,
    color: "#666",
  },
  bold: {
    fontWeight: "bold",
    color: "#333",
  },
  validationText: {
    fontSize: 12,
    marginTop: 5,
  },
  alertContainer: {
    backgroundColor: "#f8d7da",
    borderColor: "#f5c6cb",
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 20,
  },
  alertText: {
    color: "#721c24",
    fontSize: 14,
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
    marginBottom: 40,
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
