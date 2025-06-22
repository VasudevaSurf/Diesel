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
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { CameraView, Camera } from "expo-camera";
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
  const [confirmReading, setConfirmReading] = useState<string>(""); // New confirmation field
  const [dieselFilled, setDieselFilled] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [usage, setUsage] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [selectedMachineData, setSelectedMachineData] =
    useState<Machine | null>(null);
  const [imageUri, setImageUri] = useState<string>("");
  const [alertMessage, setAlertMessage] = useState<string>("");

  // QR Code scanning state
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isQRMode, setIsQRMode] = useState(true); // QR mode is default

  // Validation state
  const [currentReadingError, setCurrentReadingError] = useState<string>("");
  const [confirmReadingError, setConfirmReadingError] = useState<string>("");
  const [isValidCurrentReading, setIsValidCurrentReading] = useState(true);
  const [isValidConfirmReading, setIsValidConfirmReading] = useState(true);
  const [readingsMatch, setReadingsMatch] = useState(true);

  useEffect(() => {
    loadData();
    getBarCodeScannerPermissions();
  }, []);

  const getBarCodeScannerPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

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

  const generateMachineId = (machine: Machine) => {
    return `${machine.name}-${machine.plate}`;
  };

  const parseQRData = (data: string) => {
    try {
      // Handle deep link format: dieselpro://entry?machineId=JCB-12-AP09AB1234
      if (data.includes("dieselpro://entry?machineId=")) {
        const machineId = data.split("machineId=")[1];
        return decodeURIComponent(machineId);
      }

      // Handle direct machine ID format
      if (data.includes("-")) {
        return data;
      }

      // Handle JSON format (if needed in future)
      const parsed = JSON.parse(data);
      return parsed.machineId || parsed.id || data;
    } catch (error) {
      // If not JSON, treat as direct machine ID
      return data;
    }
  };

  const handleQRCodeScanned = ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    setScanned(true);
    setShowQRScanner(false);

    try {
      const machineId = parseQRData(data);
      console.log("Scanned QR data:", data);
      console.log("Parsed machine ID:", machineId);

      // Find machine by ID
      const machine = machines.find((m) => generateMachineId(m) === machineId);

      if (machine) {
        // Auto-populate machine data
        setSelectedMachine(machine.name);
        setSelectedMachineData(machine);
        setLastReading(machine.lastReading?.toString() || "0");
        setIsQRMode(true);

        // Clear any previous calculations and validations
        setCurrentReading("");
        setConfirmReading("");
        setDieselFilled("");
        setUsage("");
        setRate("");
        setAlertMessage("");
        setCurrentReadingError("");
        setConfirmReadingError("");
        setIsValidCurrentReading(true);
        setIsValidConfirmReading(true);
        setReadingsMatch(true);

        Alert.alert(
          "QR Code Scanned ✅",
          `Machine: ${generateMachineId(machine)}\nType: ${
            machine.machineType || "L/hr"
          }\nOwnership: ${
            machine.ownershipType || "Own"
          }\n\nPlease enter the current reading twice for verification and diesel amount.`
        );
      } else {
        Alert.alert(
          "Machine Not Found ❌",
          `The scanned QR code "${machineId}" doesn't match any registered machine.\n\nPlease check if the machine is registered in the admin panel.`,
          [
            { text: "Scan Again", onPress: () => setShowQRScanner(true) },
            { text: "Cancel", onPress: () => {} },
          ]
        );
      }
    } catch (error) {
      console.error("Error processing QR code:", error);
      Alert.alert(
        "Invalid QR Code ❌",
        "The QR code format is not recognized. Please scan a valid machine QR code.",
        [
          { text: "Scan Again", onPress: () => setShowQRScanner(true) },
          { text: "Cancel", onPress: () => {} },
        ]
      );
    }

    setScanned(false);
  };

  const validateCurrentReading = (value: string, lastRead: number): boolean => {
    const currentRead = parseFloat(value);

    // Allow empty or incomplete input during typing
    if (!value || value === "" || isNaN(currentRead)) {
      setCurrentReadingError("");
      setIsValidCurrentReading(true);
      return true;
    }

    // Only validate when user has entered a complete number and moved to next field
    if (currentRead <= lastRead) {
      setCurrentReadingError(
        `Current reading (${currentRead}) must be greater than last reading (${lastRead})`
      );
      setIsValidCurrentReading(false);
      return false;
    }

    setCurrentReadingError("");
    setIsValidCurrentReading(true);
    return true;
  };

  const validateReadingsMatch = (
    currentValue: string,
    confirmValue: string
  ): boolean => {
    // Allow empty values during typing
    if (!currentValue || !confirmValue) {
      setConfirmReadingError("");
      setReadingsMatch(true);
      return true;
    }

    const current = parseFloat(currentValue);
    const confirm = parseFloat(confirmValue);

    // Check if both are valid numbers
    if (isNaN(current) || isNaN(confirm)) {
      setConfirmReadingError("");
      setReadingsMatch(true);
      return true;
    }

    // Check if readings match
    if (current !== confirm) {
      setConfirmReadingError(
        "❌ Readings do not match! Please check both values."
      );
      setReadingsMatch(false);
      return false;
    }

    setConfirmReadingError("✅ Readings match perfectly!");
    setReadingsMatch(true);
    return true;
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

  const handleCurrentReadingChange = (value: string) => {
    setCurrentReading(value);
    const currentRead = parseFloat(value) || 0;
    const lastRead = parseFloat(lastReading) || 0;
    const diesel = parseFloat(dieselFilled) || 0;

    // Validate readings match if confirmation reading exists
    if (confirmReading) {
      validateReadingsMatch(value, confirmReading);
    }

    // Always allow typing, only validate when field loses focus or when moving to next field
    if (value && !isNaN(currentRead)) {
      calculateUsageAndRate(lastRead, currentRead, diesel);
    }
  };

  const handleConfirmReadingChange = (value: string) => {
    setConfirmReading(value);

    // Validate readings match
    validateReadingsMatch(currentReading, value);

    // If readings match, use the confirmed value for calculations
    if (
      currentReading &&
      value &&
      parseFloat(currentReading) === parseFloat(value)
    ) {
      const currentRead = parseFloat(value);
      const lastRead = parseFloat(lastReading) || 0;
      const diesel = parseFloat(dieselFilled) || 0;

      if (!isNaN(currentRead)) {
        calculateUsageAndRate(lastRead, currentRead, diesel);
      }
    }
  };

  const handleCurrentReadingBlur = () => {
    const currentRead = parseFloat(currentReading);
    const lastRead = parseFloat(lastReading) || 0;

    if (currentReading && !isNaN(currentRead)) {
      validateCurrentReading(currentReading, lastRead);
    }
  };

  const handleConfirmReadingBlur = () => {
    // Validate readings match when confirm field loses focus
    validateReadingsMatch(currentReading, confirmReading);
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

    // Use confirmed reading if available and matches, otherwise use current reading
    const readingToUse =
      readingsMatch && confirmReading
        ? parseFloat(confirmReading)
        : parseFloat(currentReading);
    const currentRead = readingToUse || 0;
    const lastRead = parseFloat(lastReading) || 0;
    calculateUsageAndRate(lastRead, currentRead, diesel);
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

  const validateForm = (): boolean => {
    if (!selectedMachine) {
      Alert.alert("Error", "Please scan a machine QR code first");
      return false;
    }

    if (phoneNumber.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return false;
    }

    const currentRead = parseFloat(currentReading);
    const confirmRead = parseFloat(confirmReading);
    const lastRead = parseFloat(lastReading) || 0;

    if (!currentReading || isNaN(currentRead)) {
      Alert.alert("Error", "Please enter current reading");
      return false;
    }

    if (!confirmReading || isNaN(confirmRead)) {
      Alert.alert("Error", "Please confirm the current reading");
      return false;
    }

    if (currentRead !== confirmRead) {
      Alert.alert(
        "Error",
        "Current reading and confirmation reading do not match. Please check both values."
      );
      return false;
    }

    if (currentRead <= lastRead) {
      Alert.alert(
        "Error",
        `Current reading (${currentRead}) must be greater than last reading (${lastRead})`
      );
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
        endReading: parseFloat(confirmReading) || 0, // Use confirmed reading
        dieselFilled: parseFloat(dieselFilled) || 0,
        remarks: remarks,
        phoneNumber: phoneNumber.replace(/\D/g, ""),
        imageURL: imageUri || "",
      };

      const result = await DieselService.submitEntry(entryData);

      if (result.success) {
        Alert.alert(
          "Success",
          result.message || "Diesel entry submitted successfully!",
          [
            {
              text: "OK",
              onPress: () => {
                // Reset form
                resetForm();
                loadData(); // Reload data
              },
            },
          ]
        );
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
    setConfirmReading("");
    setDieselFilled("");
    setRemarks("");
    setUsage("");
    setRate("");
    setSelectedMachineData(null);
    setImageUri("");
    setAlertMessage("");
    // Keep QR mode as default - don't reset to false
    setCurrentReadingError("");
    setConfirmReadingError("");
    setIsValidCurrentReading(true);
    setIsValidConfirmReading(true);
    setReadingsMatch(true);
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
          📝 Daily Diesel Entry (QR Mode)
        </ThemedText>

        {/* QR Scanner Button */}
        <TouchableOpacity
          style={styles.qrScanButton}
          onPress={() => {
            if (hasPermission) {
              setShowQRScanner(true);
            } else {
              Alert.alert(
                "Camera Permission Required",
                "Please grant camera permission to scan QR codes.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Settings", onPress: getBarCodeScannerPermissions },
                ]
              );
            }
          }}
        >
          <IconSymbol name="camera.fill" size={20} color="white" />
          <Text style={styles.qrScanButtonText}>
            {selectedMachine ? "Scan New QR Code" : "Scan Machine QR Code"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Current Stock Display */}
      <View style={styles.inventoryDisplay}>
        <Text style={styles.inventoryText}>
          📦 Current Stock: {currentBalance.toFixed(1)}L
        </Text>
      </View>

      {/* QR Scanner Modal */}
      <Modal
        visible={showQRScanner}
        animationType="slide"
        onRequestClose={() => setShowQRScanner(false)}
      >
        <View style={styles.qrContainer}>
          <View style={styles.qrHeader}>
            <TouchableOpacity
              style={styles.qrCloseButton}
              onPress={() => setShowQRScanner(false)}
            >
              <IconSymbol name="xmark" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.qrTitle}>Scan Machine QR Code</Text>
          </View>

          {hasPermission === null ? (
            <View style={styles.qrPermissionContainer}>
              <Text style={styles.qrPermissionText}>
                Requesting camera permission...
              </Text>
            </View>
          ) : hasPermission === false ? (
            <View style={styles.qrPermissionContainer}>
              <Text style={styles.qrPermissionText}>No access to camera</Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={getBarCodeScannerPermissions}
              >
                <Text style={styles.permissionButtonText}>
                  Grant Permission
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={styles.qrScanner}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleQRCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "pdf417"],
              }}
            />
          )}

          <View style={styles.qrInstructions}>
            <Text style={styles.qrInstructionText}>
              Point your camera at the machine's QR code
            </Text>
            <Text style={styles.qrSubInstructionText}>
              The QR code should be clearly visible within the frame
            </Text>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Mode Indicator */}
        <View style={styles.qrModeIndicator}>
          <IconSymbol name="camera.fill" size={20} color="#28a745" />
          <Text style={styles.qrModeText}>
            QR Mode Active - Scan machine QR code to begin
          </Text>
        </View>

        {/* Machine Selection - Always Disabled */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Machine Information</Text>
          <View style={[styles.pickerContainer, styles.disabledPicker]}>
            <Text style={styles.placeholderText}>
              {selectedMachine
                ? `${generateMachineId(selectedMachineData!)} (${
                    selectedMachineData?.ownershipType || "Own"
                  }) - ${selectedMachineData?.machineType || "L/hr"}`
                : "Please scan QR code to select machine"}
            </Text>
          </View>
          <Text style={styles.disabledNote}>
            Machine selection is only available via QR code scanning for
            security and accuracy.
          </Text>
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
                {isQRMode && (
                  <View style={[styles.badge, { backgroundColor: "#28a745" }]}>
                    <Text style={[styles.badgeText, { color: "white" }]}>
                      QR VERIFIED
                    </Text>
                  </View>
                )}
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

        {/* Enhanced Readings Section with Verification */}
        <View style={styles.readingsSection}>
          <Text style={styles.sectionTitle}>📊 Engine/KM Readings</Text>

          {/* Last Reading */}
          <View style={styles.formGroup}>
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

          {/* Current Reading - First Entry */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "Current KM Reading *"
                : "Current Engine Reading *"}
            </Text>
            <TextInput
              style={[
                styles.input,
                !isValidCurrentReading && styles.inputError,
              ]}
              value={currentReading}
              onChangeText={handleCurrentReadingChange}
              onBlur={handleCurrentReadingBlur}
              placeholder="Enter current reading"
              keyboardType="numeric"
            />
            {currentReadingError ? (
              <Text style={styles.errorText}>{currentReadingError}</Text>
            ) : null}
          </View>

          {/* Current Reading - Confirmation */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {selectedMachineData?.machineType === "KM/l"
                ? "Confirm KM Reading *"
                : "Confirm Engine Reading *"}
              <Text style={styles.labelNote}> (Double-check for accuracy)</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                !readingsMatch && confirmReading && styles.inputError,
                readingsMatch &&
                  confirmReading &&
                  currentReading &&
                  styles.inputSuccess,
              ]}
              value={confirmReading}
              onChangeText={handleConfirmReadingChange}
              onBlur={handleConfirmReadingBlur}
              placeholder="Re-enter the same reading to confirm"
              keyboardType="numeric"
            />
            {confirmReadingError ? (
              <Text
                style={[
                  styles.validationText,
                  { color: readingsMatch ? "#28a745" : "#dc3545" },
                ]}
              >
                {confirmReadingError}
              </Text>
            ) : null}
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
                currentBalance <= 0 || !readingsMatch
                  ? "#6c757d"
                  : Colors[colorScheme ?? "light"].tint,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={loading || currentBalance <= 0 || !readingsMatch}
        >
          <Text style={styles.submitButtonText}>
            {loading
              ? "Submitting..."
              : currentBalance <= 0
              ? "No Diesel Available"
              : !readingsMatch
              ? "Verify Readings First"
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
    position: "relative",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 10,
  },
  qrScanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "center",
    gap: 8,
  },
  qrScanButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
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
  qrModeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d4edda",
    borderColor: "#c3e6cb",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 20,
    gap: 10,
  },
  qrModeText: {
    color: "#155724",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledPicker: {
    backgroundColor: "#f8f9fa",
    borderColor: "#e9ecef",
  },
  placeholderText: {
    padding: 15,
    fontSize: 16,
    color: "#6c757d",
    fontStyle: "italic",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  readingsSection: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#007bff",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
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
  labelNote: {
    fontSize: 12,
    fontWeight: "400",
    color: "#666",
    fontStyle: "italic",
  },
  input: {
    borderWidth: 2,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "white",
  },
  inputError: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  inputSuccess: {
    borderColor: "#28a745",
    backgroundColor: "#f0fff4",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 12,
    marginTop: 5,
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
  disabledNote: {
    fontSize: 12,
    color: "#6c757d",
    fontStyle: "italic",
    marginTop: 5,
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
  // QR Scanner Styles
  qrContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    position: "relative",
  },
  qrCloseButton: {
    position: "absolute",
    left: 20,
    top: 55,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 20,
    padding: 8,
  },
  qrTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  qrScanner: {
    flex: 1,
  },
  qrInstructions: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 20,
    paddingVertical: 30,
    alignItems: "center",
  },
  qrInstructionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 5,
  },
  qrSubInstructionText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    textAlign: "center",
  },
  qrPermissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  qrPermissionText: {
    color: "white",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#007bff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
