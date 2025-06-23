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

  // Edit Machine Modal State
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [editMachineName, setEditMachineName] = useState<string>("");
  const [editMachinePlate, setEditMachinePlate] = useState<string>("");
  const [editMachineType, setEditMachineType] = useState<string>("L/hr");
  const [editOwnershipType, setEditOwnershipType] = useState<string>("Own");
  const [editLastReading, setEditLastReading] = useState<string>("");
  const [editStandardAvgDiesel, setEditStandardAvgDiesel] =
    useState<string>("");
  const [editExpectedDailyHours, setEditExpectedDailyHours] =
    useState<string>("");
  const [editDoorNo, setEditDoorNo] = useState<string>("");
  const [editMachineRemarks, setEditMachineRemarks] = useState<string>("");
  const [editDateAdded, setEditDateAdded] = useState<string>("");

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

  const validateEditMachineForm = (): boolean => {
    if (!editMachineName.trim()) {
      Alert.alert("Error", "Please enter machine name");
      return false;
    }

    if (!editMachinePlate.trim()) {
      Alert.alert("Error", "Please enter plate number");
      return false;
    }

    if (!editLastReading || parseFloat(editLastReading) < 0) {
      Alert.alert("Error", "Please enter valid last reading");
      return false;
    }

    if (!editStandardAvgDiesel || parseFloat(editStandardAvgDiesel) <= 0) {
      Alert.alert("Error", "Please enter valid standard average diesel");
      return false;
    }

    if (!editExpectedDailyHours || parseFloat(editExpectedDailyHours) <= 0) {
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

  const handleEditMachine = async () => {
    if (!validateEditMachineForm() || !editingMachine) return;

    try {
      setLoading(true);

      const updates: Partial<Machine> = {
        name: editMachineName.trim(),
        plate: editMachinePlate.trim(),
        machineType: editMachineType,
        ownershipType: editOwnershipType,
        lastReading: parseFloat(editLastReading),
        standardAvgDiesel: parseFloat(editStandardAvgDiesel),
        expectedDailyHours: parseFloat(editExpectedDailyHours),
        doorNo: editDoorNo.trim(),
        remarks: editMachineRemarks.trim(),
        dateAdded: editDateAdded,
      };

      const result = await DieselService.updateMachine(
        editingMachine.name,
        updates
      );

      if (result.success) {
        Alert.alert("Success", "Machine updated successfully!", [
          {
            text: "OK",
            onPress: () => {
              setEditModalVisible(false);
              resetEditForm();
              loadMachines();
            },
          },
        ]);
      } else {
        Alert.alert("Error", result.message || "Failed to update machine");
      }
    } catch (error) {
      console.error("Error updating machine:", error);
      Alert.alert("Error", "Failed to update machine. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (machine: Machine) => {
    setEditingMachine(machine);
    setEditMachineName(machine.name);
    setEditMachinePlate(machine.plate || "");
    setEditMachineType(machine.machineType || "L/hr");
    setEditOwnershipType(machine.ownershipType || "Own");
    setEditLastReading((machine.lastReading || 0).toString());
    setEditStandardAvgDiesel((machine.standardAvgDiesel || 0).toString());
    setEditExpectedDailyHours((machine.expectedDailyHours || 0).toString());
    setEditDoorNo(machine.doorNo || "");
    setEditMachineRemarks(machine.remarks || "");
    setEditDateAdded(
      machine.dateAdded || new Date().toISOString().split("T")[0]
    );
    setEditModalVisible(true);
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

  const resetEditForm = () => {
    setEditingMachine(null);
    setEditMachineName("");
    setEditMachinePlate("");
    setEditMachineType("L/hr");
    setEditOwnershipType("Own");
    setEditLastReading("");
    setEditStandardAvgDiesel("");
    setEditExpectedDailyHours("");
    setEditDoorNo("");
    setEditMachineRemarks("");
    setEditDateAdded("");
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

      const entryData = {
        machineName: backLogMachine,
        startReading: parseFloat(backLogStartReading),
        endReading: parseFloat(backLogEndReading),
        dieselFilled: parseFloat(backLogDiesel),
        remarks: backLogRemarks || "Back-dated entry",
        phoneNumber: "0000000000",
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
    return `dieselpro://entry?machineId=${encodeURIComponent(machineId)}`;
  };

  const showQRCode = (machine: Machine) => {
    setSelectedMachineForQR(machine);
    setQrModalVisible(true);
  };

  const shareQRCode = async () => {
    if (!selectedMachineForQR) return;

    try {
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

  // FIXED: Implement proper delete functionality
  const deleteMachine = (machine: Machine) => {
    Alert.alert(
      "Delete Machine",
      `Are you sure you want to delete "${generateMachineId(
        machine
      )}"?\n\nThis action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);

              // Call the actual delete function from DieselService
              const result = await DieselService.deleteMachine(machine.name, {
                deletionReason: "Deleted from admin panel",
                deletedBy: "Admin User",
                forceDelete: false,
              });

              if (result.success) {
                Alert.alert("Success", "Machine deleted successfully!", [
                  {
                    text: "OK",
                    onPress: () => {
                      loadMachines(); // Reload the machines list
                    },
                  },
                ]);
              } else {
                // Handle case where deletion requires confirmation
                if (result.hasLogs && result.requiresConfirmation) {
                  Alert.alert(
                    "Machine Has Logs",
                    result.message + "\n\nDo you want to force delete?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Force Delete",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            const forceResult =
                              await DieselService.deleteMachine(machine.name, {
                                deletionReason:
                                  "Force deleted from admin panel",
                                deletedBy: "Admin User",
                                forceDelete: true,
                              });

                            if (forceResult.success) {
                              Alert.alert(
                                "Success",
                                "Machine force deleted successfully!"
                              );
                              loadMachines();
                            } else {
                              Alert.alert(
                                "Error",
                                forceResult.message ||
                                  "Failed to force delete machine"
                              );
                            }
                          } catch (error) {
                            console.error(
                              "Error force deleting machine:",
                              error
                            );
                            Alert.alert(
                              "Error",
                              "Failed to force delete machine. Please try again."
                            );
                          }
                        },
                      },
                    ]
                  );
                } else {
                  Alert.alert(
                    "Error",
                    result.message || "Failed to delete machine"
                  );
                }
              }
            } catch (error) {
              console.error("Error deleting machine:", error);
              Alert.alert(
                "Error",
                "Failed to delete machine. Please try again."
              );
            } finally {
              setLoading(false);
            }
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
        {item.doorNo && (
          <Text style={styles.machineDetail}>
            <Text style={styles.bold}>Door No:</Text> {item.doorNo}
          </Text>
        )}
      </View>

      <View style={styles.machineActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: "#28a745" }]}
          onPress={() => openEditModal(item)}
          disabled={loading}
        >
          <IconSymbol name="gear" size={16} color="white" />
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>

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
          disabled={loading}
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

      {/* Edit Machine Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setEditModalVisible(false)}
            >
              <IconSymbol name="xmark" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Machine</Text>
            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: Colors[colorScheme ?? "light"].tint },
              ]}
              onPress={handleEditMachine}
              disabled={loading}
            >
              <Text style={styles.modalSaveButtonText}>
                {loading ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Machine Name and Plate */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Machine Name *</Text>
                <TextInput
                  style={styles.input}
                  value={editMachineName}
                  onChangeText={setEditMachineName}
                  placeholder="e.g., JCB-12"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Plate No / Engine No *</Text>
                <TextInput
                  style={styles.input}
                  value={editMachinePlate}
                  onChangeText={setEditMachinePlate}
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
                    selectedValue={editMachineType}
                    onValueChange={setEditMachineType}
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
                    selectedValue={editOwnershipType}
                    onValueChange={setEditOwnershipType}
                    style={styles.picker}
                  >
                    <Picker.Item label="Own" value="Own" />
                    <Picker.Item label="Rental" value="Rental" />
                  </Picker>
                </View>
              </View>
            </View>

            {/* Last Reading and Standard Avg */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Last Reading *</Text>
                <TextInput
                  style={styles.input}
                  value={editLastReading}
                  onChangeText={setEditLastReading}
                  placeholder="Current reading"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Standard Avg Diesel *</Text>
                <TextInput
                  style={styles.input}
                  value={editStandardAvgDiesel}
                  onChangeText={setEditStandardAvgDiesel}
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
                  value={editExpectedDailyHours}
                  onChangeText={setEditExpectedDailyHours}
                  placeholder="Expected daily working hours"
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Door No (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={editDoorNo}
                  onChangeText={setEditDoorNo}
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
                  value={editMachineRemarks}
                  onChangeText={setEditMachineRemarks}
                  placeholder="Additional notes about this machine"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.label}>Date Added</Text>
                <TextInput
                  style={styles.input}
                  value={editDateAdded}
                  onChangeText={setEditDateAdded}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* FIXED: QR Code Modal with proper styling */}
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>
                QR Code for{" "}
                {selectedMachineForQR
                  ? generateMachineId(selectedMachineForQR)
                  : ""}
              </Text>
              <TouchableOpacity
                style={styles.qrModalCloseButton}
                onPress={() => setQrModalVisible(false)}
              >
                <IconSymbol name="xmark" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedMachineForQR && (
              <View style={styles.qrContainer}>
                <View style={styles.qrCodeWrapper}>
                  <QRCode
                    value={generateQRData(selectedMachineForQR)}
                    size={200}
                    backgroundColor="white"
                    color="black"
                  />
                </View>

                <View style={styles.machineInfo}>
                  <Text style={styles.machineInfoTitle}>
                    {selectedMachineForQR.name}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    <Text style={styles.machineInfoLabel}>Plate:</Text>{" "}
                    {selectedMachineForQR.plate}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    <Text style={styles.machineInfoLabel}>Type:</Text>{" "}
                    {selectedMachineForQR.machineType || "L/hr"}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    <Text style={styles.machineInfoLabel}>Ownership:</Text>{" "}
                    {selectedMachineForQR.ownershipType || "Own"}
                  </Text>
                  <Text style={styles.machineInfoText}>
                    <Text style={styles.machineInfoLabel}>Last Reading:</Text>{" "}
                    {selectedMachineForQR.lastReading || 0}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.qrModalButtons}>
              <TouchableOpacity
                style={[styles.qrModalButton, styles.qrShareButton]}
                onPress={shareQRCode}
              >
                <IconSymbol
                  name="square.and.arrow.up"
                  size={20}
                  color="white"
                />
                <Text style={styles.qrModalButtonText}>Share QR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.qrModalButton, styles.qrCloseButton]}
                onPress={() => setQrModalVisible(false)}
              >
                <IconSymbol name="xmark" size={20} color="white" />
                <Text style={styles.qrModalButtonText}>Close</Text>
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
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "white",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalSaveButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // FIXED: QR Modal styles
  qrModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  qrModalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  qrModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  qrModalCloseButton: {
    padding: 8,
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: 20,
    width: "100%",
  },
  qrCodeWrapper: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  machineInfo: {
    alignItems: "center",
    marginTop: 20,
    width: "100%",
  },
  machineInfoTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  machineInfoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
    textAlign: "center",
  },
  machineInfoLabel: {
    fontWeight: "bold",
    color: "#333",
  },
  qrModalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 10,
  },
  qrModalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  qrShareButton: {
    backgroundColor: "#17a2b8",
  },
  qrCloseButton: {
    backgroundColor: "#6c757d",
  },
  qrModalButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
