import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import QRCode from "react-native-qrcode-svg";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService, Machine } from "@/services/DieselService";
import { Picker } from "@react-native-picker/picker";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";

export default function AdminScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedTab, setSelectedTab] = useState<"add" | "manage" | "backlog">(
    "add"
  );

  // Add Machine Form State
  const [machineName, setMachineName] = useState<string>("");
  const [machinePlate, setMachinePlate] = useState<string>("");
  const [machineType, setMachineType] = useState<string>("L/hr");
  const [ownershipType, setOwnershipType] = useState<string>("Own");
  const [initialReading, setInitialReading] = useState<string>("");
  const [standardAvgDiesel, setStandardAvgDiesel] = useState<string>("");
  const [expectedDailyHours, setExpectedDailyHours] = useState<string>("");
  const [doorNo, setDoorNo] = useState<string>("");
  const [machineRemarks, setMachineRemarks] = useState<string>("");
  const [dateAdded, setDateAdded] = useState<string>("");

  // Back Log Form State
  const [backLogDate, setBackLogDate] = useState<string>("");
  const [backLogMachine, setBackLogMachine] = useState<string>("");
  const [backLogStartReading, setBackLogStartReading] = useState<string>("");
  const [backLogEndReading, setBackLogEndReading] = useState<string>("");
  const [backLogDiesel, setBackLogDiesel] = useState<string>("");
  const [backLogRemarks, setBackLogRemarks] = useState<string>("");

  // QR Code Modal State
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [selectedMachineForQR, setSelectedMachineForQR] =
    useState<Machine | null>(null);

  useEffect(() => {
    loadMachines();
    setDateAdded(new Date().toISOString().split("T")[0]);
    setBackLogDate(new Date().toISOString().split("T")[0]);
  }, []);

  const loadMachines = async () => {
    try {
      setLoading(true);
      const machinesData = await DieselService.getMachines();
      setMachines(machinesData);
    } catch (error) {
      console.error("Error loading machines:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateAddMachineForm = (): boolean => {
    if (!machineName.trim()) {
      Alert.alert("Error", "Please enter machine name");
      return false;
    }

    if (!machinePlate.trim()) {
      Alert.alert("Error", "Please enter plate number");
      return false;
    }

    if (!initialReading || parseFloat(initialReading) < 0) {
      Alert.alert("Error", "Please enter valid initial reading");
      return false;
    }

    if (!standardAvgDiesel || parseFloat(standardAvgDiesel) <= 0) {
      Alert.alert("Error", "Please enter valid standard average diesel");
      return false;
    }

    if (!expectedDailyHours || parseFloat(expectedDailyHours) <= 0) {
      Alert.alert("Error", "Please enter valid expected daily hours");
      return false;
    }

    return true;
  };

  const handleAddMachine = async () => {
    if (!validateAddMachineForm()) return;

    try {
      setLoading(true);

      const machineData: Omit<Machine, "lastReading"> = {
        name: machineName.trim(),
        plate: machinePlate.trim(),
        machineType,
        ownershipType,
        initialReading: parseFloat(initialReading),
        standardAvgDiesel: parseFloat(standardAvgDiesel),
        expectedDailyHours: parseFloat(expectedDailyHours),
        doorNo: doorNo.trim(),
        remarks: machineRemarks.trim(),
        dateAdded,
      };

      const result = await DieselService.addMachine(machineData);

      if (result.success) {
        Alert.alert("Success", "Machine with QR code added successfully!", [
          {
            text: "OK",
            onPress: () => {
              resetAddMachineForm();
              loadMachines();
            },
          },
        ]);
      } else {
        Alert.alert("Error", result.message || "Failed to add machine");
      }
    } catch (error) {
      console.error("Error adding machine:", error);
      Alert.alert("Error", "Failed to add machine. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetAddMachineForm = () => {
    setMachineName("");
    setMachinePlate("");
    setMachineType("L/hr");
    setOwnershipType("Own");
    setInitialReading("");
    setStandardAvgDiesel("");
    setExpectedDailyHours("");
    setDoorNo("");
    setMachineRemarks("");
    setDateAdded(new Date().toISOString().split("T")[0]);
  };

  const validateBackLogForm = (): boolean => {
    if (!backLogMachine) {
      Alert.alert("Error", "Please select a machine");
      return false;
    }

    if (!backLogStartReading || !backLogEndReading) {
      Alert.alert("Error", "Please enter both start and end readings");
      return false;
    }

    if (parseFloat(backLogEndReading) <= parseFloat(backLogStartReading)) {
      Alert.alert("Error", "End reading must be greater than start reading");
      return false;
    }

    if (!backLogDiesel || parseFloat(backLogDiesel) <= 0) {
      Alert.alert("Error", "Please enter valid diesel amount");
      return false;
    }

    return true;
  };

  const handleBackLogSubmit = async () => {
    if (!validateBackLogForm()) return;

    try {
      setLoading(true);

      // For now, we'll use the regular entry submission with back-dated info
      const entryData = {
        machineName: backLogMachine,
        startReading: parseFloat(backLogStartReading),
        endReading: parseFloat(backLogEndReading),
        dieselFilled: parseFloat(backLogDiesel),
        remarks: backLogRemarks || "Back-dated entry",
        phoneNumber: "0000000000", // Default for admin entries
        imageURL: "",
      };

      const result = await DieselService.submitEntry(entryData);

      if (result.success) {
        Alert.alert("Success", "Back-dated entry submitted successfully!", [
          {
            text: "OK",
            onPress: () => resetBackLogForm(),
          },
        ]);
      } else {
        Alert.alert(
          "Error",
          result.message || "Failed to submit back-dated entry"
        );
      }
    } catch (error) {
      console.error("Error submitting back-dated entry:", error);
      Alert.alert(
        "Error",
        "Failed to submit back-dated entry. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const resetBackLogForm = () => {
    setBackLogMachine("");
    setBackLogStartReading("");
    setBackLogEndReading("");
    setBackLogDiesel("");
    setBackLogRemarks("");
    setBackLogDate(new Date().toISOString().split("T")[0]);
  };

  const generateMachineId = (machine: Machine) => {
    return `${machine.name}-${machine.plate}`;
  };

  const generateQRData = (machine: Machine) => {
    const machineId = generateMachineId(machine);
    // This should match your app's deep linking URL scheme
    return `dieselpro://entry?machineId=${encodeURIComponent(machineId)}`;
  };

  const showQRCode = (machine: Machine) => {
    setSelectedMachineForQR(machine);
    setQrModalVisible(true);
  };

  const shareQRCode = async () => {
    if (!selectedMachineForQR) return;

    try {
      // This would require implementing ViewShot for capturing QR code
      // For now, we'll share the QR data as text
      const qrData = generateQRData(selectedMachineForQR);
      const machineId = generateMachineId(selectedMachineForQR);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync("", {
          mimeType: "text/plain",
          dialogTitle: `QR Code for ${machineId}`,
        });
      } else {
        Alert.alert("QR Data", qrData);
      }
    } catch (error) {
      console.error("Error sharing QR code:", error);
      Alert.alert("Error", "Failed to share QR code");
    }
  };

  const deleteMachine = (machine: Machine) => {
    Alert.alert(
      "Delete Machine",
      `Are you sure you want to delete "${generateMachineId(machine)}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Implement delete functionality
            Alert.alert(
              "Info",
              "Delete functionality will be implemented in backend"
            );
          },
        },
      ]
    );
  };

  const renderMachineItem = ({ item }: { item: Machine }) => (
    <View style={styles.machineItem}>
      <View style={styles.machineHeader}>
        <Text style={styles.machineId}>{generateMachineId(item)}</Text>
        <View style={styles.machineBadges}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  item.ownershipType === "Rental" ? "#ffeaa7" : "#81ecec",
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    item.ownershipType === "Rental" ? "#d63031" : "#00b894",
                },
              ]}
            >
              {item.ownershipType || "Own"}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  item.machineType === "KM/l" ? "#fd79a8" : "#74b9ff",
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color: item.machineType === "KM/l" ? "#e84393" : "#0984e3",
                },
              ]}
            >
              {item.machineType || "L/hr"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.machineDetails}>
        <Text style={styles.machineDetail}>
          <Text style={styles.bold}>Last Reading:</Text> {item.lastReading || 0}
        </Text>
        <Text style={styles.machineDetail}>
          <Text style={styles.bold}>Standard Avg:</Text>{" "}
          {item.standardAvgDiesel || "N/A"} {item.machineType || "L/hr"}
        </Text>
        <Text style={styles.machineDetail}>
          <Text style={styles.bold}>Expected Daily:</Text>{" "}
          {item.expectedDailyHours || "N/A"} hrs
        </Text>
      </View>

      <View style={styles.machineActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: "#17a2b8" }]}
          onPress={() => showQRCode(item)}
        >
          <IconSymbol name="qrcode" size={16} color="white" />
          <Text style={styles.actionButtonText}>QR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: "#dc3545" }]}
          onPress={() => deleteMachine(item)}
        >
          <IconSymbol name="trash" size={16} color="white" />
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTabButton = (
    tab: typeof selectedTab,
    title: string,
    icon: string
  ) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        {
          backgroundColor:
            selectedTab === tab
              ? Colors[colorScheme ?? "light"].tint
              : "#f8f9fa",
        },
      ]}
      onPress={() => setSelectedTab(tab)}
    >
      <IconSymbol
        name={icon as any}
        size={20}
        color={selectedTab === tab ? "white" : "#666"}
      />
      <Text
        style={[
          styles.tabButtonText,
          {
            color: selectedTab === tab ? "white" : "#666",
          },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
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
          🔐 Enhanced Machine Management
        </ThemedText>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton("add", "Add Machine", "plus.circle")}
        {renderTabButton("manage", "Manage", "gear")}
        {renderTabButton("backlog", "Back Log", "clock")}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Add Machine Tab */}
        {selectedTab === "add" && (
          <View style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Add New Machine</ThemedText>

            {/* Machine Name and Plate */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Machine Name *</Text>
                <TextInput
                  style={styles.input}
                  value={machineName}
                  onChangeText={setMachineName}
                  placeholder="e.g., JCB-12"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Plate No / Engine No *</Text>
                <TextInput
                  style={styles.input}
                  value={machinePlate}
                  onChangeText={setMachinePlate}
                  placeholder="e.g., AP09AB1234"
                />
              </View>
            </View>

            {/* Machine Type and Ownership */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Machine Type *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={machineType}
                    onValueChange={setMachineType}
                    style={styles.picker}
                  >
                    <Picker.Item label="L/hr (Engine Hours)" value="L/hr" />
                    <Picker.Item
                      label="KM/l (Kilometers per Liter)"
                      value="KM/l"
                    />
                  </Picker>
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Ownership Type *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={ownershipType}
                    onValueChange={setOwnershipType}
                    style={styles.picker}
                  >
                    <Picker.Item label="Own" value="Own" />
                    <Picker.Item label="Rental" value="Rental" />
                  </Picker>
                </View>
              </View>
            </View>

            {/* Initial Reading and Standard Avg */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Initial Reading *</Text>
                <TextInput
                  style={styles.input}
                  value={initialReading}
                  onChangeText={setInitialReading}
                  placeholder="Starting reading"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Standard Avg Diesel *</Text>
                <TextInput
                  style={styles.input}
                  value={standardAvgDiesel}
                  onChangeText={setStandardAvgDiesel}
                  placeholder="Standard consumption rate"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Expected Daily Hours and Door No */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Expected Daily Hours *</Text>
                <TextInput
                  style={styles.input}
                  value={expectedDailyHours}
                  onChangeText={setExpectedDailyHours}
                  placeholder="Expected daily working hours"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Door No (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={doorNo}
                  onChangeText={setDoorNo}
                  placeholder="Internal location"
                />
              </View>
            </View>

            {/* Remarks and Date Added */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Remarks (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={machineRemarks}
                  onChangeText={setMachineRemarks}
                  placeholder="Additional notes about this machine"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Date Added</Text>
                <TextInput
                  style={styles.input}
                  value={dateAdded}
                  onChangeText={setDateAdded}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>

            {/* Add Machine Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: Colors[colorScheme ?? "light"].tint,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleAddMachine}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Adding Machine..." : "Add Machine"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Manage Machines Tab */}
        {selectedTab === "manage" && (
          <View style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>
              Existing Machines
            </ThemedText>

            {machines.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  name="wrench.and.screwdriver"
                  size={48}
                  color="#ccc"
                />
                <Text style={styles.emptyText}>No machines found</Text>
              </View>
            ) : (
              <FlatList
                data={machines}
                renderItem={renderMachineItem}
                keyExtractor={(item, index) => `machine-${index}`}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
              />
            )}
          </View>
        )}

        {/* Back Log Tab */}
        {selectedTab === "backlog" && (
          <View style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Back Data Entry</ThemedText>

            {/* Entry Date and Machine */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Entry Date</Text>
                <TextInput
                  style={styles.input}
                  value={backLogDate}
                  onChangeText={setBackLogDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Select Machine</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={backLogMachine}
                    onValueChange={setBackLogMachine}
                    style={styles.picker}
                  >
                    <Picker.Item label="-- Select Machine --" value="" />
                    {machines.map((machine, index) => (
                      <Picker.Item
                        key={index}
                        label={generateMachineId(machine)}
                        value={machine.name}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {/* Start and End Reading */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Start Reading</Text>
                <TextInput
                  style={styles.input}
                  value={backLogStartReading}
                  onChangeText={setBackLogStartReading}
                  placeholder="Start reading"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>End Reading</Text>
                <TextInput
                  style={styles.input}
                  value={backLogEndReading}
                  onChangeText={setBackLogEndReading}
                  placeholder="End reading"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Diesel and Remarks */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Diesel Filled (Liters)</Text>
                <TextInput
                  style={styles.input}
                  value={backLogDiesel}
                  onChangeText={setBackLogDiesel}
                  placeholder="Diesel amount"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Remarks</Text>
                <TextInput
                  style={styles.input}
                  value={backLogRemarks}
                  onChangeText={setBackLogRemarks}
                  placeholder="Back-dated entry remarks"
                />
              </View>
            </View>

            {/* Submit Back Entry Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: Colors[colorScheme ?? "light"].tint,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleBackLogSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Submitting..." : "Submit Back Entry"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              QR Code for{" "}
              {selectedMachineForQR
                ? generateMachineId(selectedMachineForQR)
                : ""}
            </Text>

            {selectedMachineForQR && (
              <View style={styles.qrContainer}>
                <QRCode
                  value={generateQRData(selectedMachineForQR)}
                  size={200}
                  backgroundColor="white"
                  color="black"
                />

                <View style={styles.machineInfo}>
                  <Text style={styles.machineInfoText}>
                    <Text style={styles.bold}>{selectedMachineForQR.name}</Text>
                  </Text>
                  <Text style={styles.machineInfoText}>
                    Plate: {selectedMachineForQR.plate}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    Type: {selectedMachineForQR.machineType || "L/hr"}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    Ownership: {selectedMachineForQR.ownershipType || "Own"}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#17a2b8" }]}
                onPress={shareQRCode}
              >
                <IconSymbol
                  name="square.and.arrow.up"
                  size={20}
                  color="white"
                />
                <Text style={styles.modalButtonText}>Share QR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#6c757d" }]}
                onPress={() => setQrModalVisible(false)}
              >
                <IconSymbol name="xmark" size={20} color="white" />
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#f8f9fa",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 5,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tabContent: {
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
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
  textArea: {
    height: 80,
    textAlignVertical: "top",
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
  submitButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 40,
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  machineItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  machineHeader: {
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
  machineBadges: {
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
  machineDetails: {
    marginBottom: 15,
    gap: 5,
  },
  machineDetail: {
    fontSize: 14,
    color: "#666",
  },
  bold: {
    fontWeight: "bold",
    color: "#333",
  },
  machineActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 5,
  },
  actionButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 15,
    padding: 30,
    alignItems: "center",
    maxWidth: 350,
    width: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  machineInfo: {
    alignItems: "center",
    marginTop: 15,
    gap: 3,
  },
  machineInfoText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    gap: 5,
  },
  modalButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
