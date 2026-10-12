import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { rosterTemplate } from './csv';

export function CsvFiles({ disabled, onRead, onError }: { disabled: boolean; onRead: (text: string) => void; onError: (message: string) => void }) {
  function download() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rosterTemplate], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'classpulse-roster-template.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { onError('Upload a .csv file, not an Excel workbook. Save your filled template as CSV UTF-8 first.'); return; }
    if (file.size > 256 * 1024) { onError('Use a CSV smaller than 256 KB.'); return; }
    try { onRead(await file.text()); } catch { onError('Could not read that file. Please select it again.'); }
  }
  return <View style={{ gap: 15 }}>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={download} style={{ backgroundColor: '#F0F7FA', padding: 10, borderRadius: 4, alignSelf: 'flex-start', opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#263B4B', fontWeight: '600' }}>Download roster template ↓</Text></Pressable>
    <Text style={{ color: '#667582', lineHeight: 23 }}>Columns: id,name,emailid. ID and name are required; emailid can be blank. Set the ID column to Text in Excel, then save as CSV UTF-8.</Text>
    {React.createElement('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Upload filled roster CSV', disabled, onChange: upload, style: { maxWidth: '100%', color: '#263B4B', fontSize: 14 } })}
  </View>;
}
