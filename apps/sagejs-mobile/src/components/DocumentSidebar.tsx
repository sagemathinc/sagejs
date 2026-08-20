import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WorksheetSummary } from '../documents/model';

interface Props {
  recent: WorksheetSummary[];
  activeId: string;
  onSelect(id: string): void;
}

export function DocumentSidebar({ recent, activeId, onSelect }: Props) {
  return (
    <View style={styles.sidebar} accessibilityLabel="Recent worksheets">
      <Text accessibilityRole="header" style={styles.heading}>
        Recent worksheets
      </Text>
      <FlatList
        data={recent}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            accessibilityState={{ selected: item.id === activeId }}
            onPress={() => onSelect(item.id)}
            style={[styles.document, item.id === activeId && styles.active]}
          >
            <Text numberOfLines={2} style={styles.title}>
              {item.title}
            </Text>
            <Text style={styles.date}>
              {new Date(item.updatedAt).toLocaleString()}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No saved worksheets</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: '#f7f8f5',
    borderRightColor: '#ccd3c8',
    borderRightWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 220,
  },
  heading: { color: '#243029', fontSize: 18, fontWeight: '700', padding: 14 },
  document: {
    borderTopColor: '#dce1d9',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  active: { backgroundColor: '#dcebdc' },
  title: { color: '#18251d', fontSize: 15, fontWeight: '600' },
  date: { color: '#59635c', fontSize: 11, marginTop: 4 },
  empty: { color: '#59635c', padding: 14 },
});
