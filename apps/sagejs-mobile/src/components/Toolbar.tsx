import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  compact: boolean;
  runtimeReady: boolean;
  onNew(): void;
  onImport(): void;
  onExport(): void;
  onShare(): void;
  onInterrupt(): void;
  onSettings(): void;
  onToggleDocuments(): void;
}

export function Toolbar(props: Props) {
  return (
    <View style={styles.toolbar} accessibilityRole="toolbar">
      {props.compact ? (
        <Action
          label="Documents"
          short="Files"
          onPress={props.onToggleDocuments}
        />
      ) : null}
      <Action label="New worksheet" short="New" onPress={props.onNew} />
      <Action
        label="Import from Files or iCloud"
        short="Import"
        onPress={props.onImport}
      />
      <Action
        label="Export to Files or iCloud"
        short="Export"
        onPress={props.onExport}
      />
      <Action
        label="Share worksheet source"
        short="Share"
        onPress={props.onShare}
      />
      <View style={styles.spacer} />
      <Action
        label="Interrupt Sage.js computation"
        short="Interrupt"
        onPress={props.onInterrupt}
        disabled={!props.runtimeReady}
        danger
      />
      <Action
        label="Resource and appearance settings"
        short="Settings"
        onPress={props.onSettings}
      />
    </View>
  );
}

function Action({
  label,
  short,
  onPress,
  disabled = false,
  danger = false,
}: {
  label: string;
  short: string;
  onPress(): void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        danger && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, danger && styles.dangerText]}>
        {short}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: 'center',
    backgroundColor: '#f1f4ed',
    borderBottomColor: '#ccd3c8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 50,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  spacer: { flex: 1 },
  action: {
    backgroundColor: '#fff',
    borderColor: '#aeb7aa',
    borderRadius: 7,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionText: { color: '#1d3123', fontSize: 14, fontWeight: '600' },
  danger: { borderColor: '#a44747' },
  dangerText: { color: '#8a2525' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
});
