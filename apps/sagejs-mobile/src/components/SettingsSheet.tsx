import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RuntimeSettings } from '../bridge/protocol';
import { normalizeSettings } from '../settings/store';

interface Props {
  visible: boolean;
  settings: RuntimeSettings;
  onChange(settings: RuntimeSettings): void;
  onClose(): void;
}

export function SettingsSheet({ visible, settings, onChange, onClose }: Props) {
  const update = (patch: Partial<RuntimeSettings>) =>
    onChange(normalizeSettings({ ...settings, ...patch }));
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.heading}>
            Mobile runtime settings
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            onPress={onClose}
            style={styles.done}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>Appearance</Text>
        <View style={styles.segment}>
          {(['system', 'light', 'dark'] as const).map(appearance => (
            <Pressable
              key={appearance}
              accessibilityRole="button"
              accessibilityState={{
                selected: settings.appearance === appearance,
              }}
              onPress={() => update({ appearance })}
              style={[
                styles.segmentButton,
                settings.appearance === appearance && styles.selected,
              ]}
            >
              <Text style={styles.value}>{appearance}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Evaluation timeout in seconds</Text>
        <TextInput
          accessibilityLabel="Evaluation timeout in seconds"
          keyboardType="number-pad"
          value={String(settings.evaluationTimeoutMs / 1000)}
          onChangeText={text =>
            update({ evaluationTimeoutMs: Number(text) * 1000 })
          }
          style={styles.input}
        />
        <Text style={styles.label}>Target memory ceiling in MiB</Text>
        <TextInput
          accessibilityLabel="Target memory ceiling in MiB"
          keyboardType="number-pad"
          value={String(settings.memoryTargetMiB)}
          onChangeText={text => update({ memoryTargetMiB: Number(text) })}
          style={styles.input}
        />
        <Text style={styles.help}>
          The timeout is enforced by terminating the worker. The memory value is
          a release/device feasibility target until the Wasm module publishes a
          hard memory maximum.
        </Text>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Interrupt when app enters background</Text>
          <Switch
            accessibilityLabel="Interrupt computation in background"
            value={settings.autoInterruptOnBackground}
            onValueChange={value =>
              update({ autoInterruptOnBackground: value })
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#fbfbf8', flex: 1, padding: 20 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  heading: { color: '#1c2920', fontSize: 22, fontWeight: '700' },
  done: { padding: 10 },
  doneText: { color: '#24643b', fontSize: 17, fontWeight: '700' },
  label: { color: '#27322b', fontSize: 16, fontWeight: '600', marginTop: 18 },
  segment: { flexDirection: 'row', gap: 8, marginTop: 8 },
  segmentButton: {
    borderColor: '#aeb7aa',
    borderRadius: 7,
    borderWidth: 1,
    padding: 10,
  },
  selected: { backgroundColor: '#dcebdc' },
  value: { color: '#1c2920' },
  input: {
    backgroundColor: '#fff',
    borderColor: '#aeb7aa',
    borderRadius: 7,
    borderWidth: 1,
    color: '#1c2920',
    fontSize: 17,
    marginTop: 8,
    padding: 10,
  },
  help: { color: '#5a635c', lineHeight: 20, marginTop: 10 },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
