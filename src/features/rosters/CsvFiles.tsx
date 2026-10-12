import React from 'react';
import { Text } from 'react-native';
export function CsvFiles(_props: { disabled: boolean; onRead: (text: string) => void; onError: (message: string) => void }) {
  return <Text style={{ color: '#61736E' }}>Open Classpulse in your phone or laptop browser to download and upload CSV files. Native file selection will be added with the mobile release.</Text>;
}
