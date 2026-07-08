import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

export type PickedFile = { uri: string; fileName: string; mimeType: string; size?: number; isImage: boolean };

/** Pick an image from the photo library. Returns null if cancelled/denied. */
export async function pickImage(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, allowsEditing: true, aspect: [1, 1] });
  const a = r.assets?.[0];
  if (r.canceled || !a) return null;
  return { uri: a.uri, fileName: a.fileName || `photo_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize, isImage: true };
}

/** Pick a photo (library or camera). Returns null if cancelled/denied.
 *  On web there's no permission gate and the camera isn't available, so we
 *  always use the library picker there. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedFile | null> {
  const useCamera = source === 'camera' && Platform.OS !== 'web';
  if (Platform.OS !== 'web') {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { quality: 0.5, allowsEditing: false };
  const r = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.assets?.[0];
  if (r.canceled || !a) return null;
  return { uri: a.uri, fileName: a.fileName || `photo_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize, isImage: true };
}

/** Pick a document (PDF / Word / image). Returns null if cancelled. */
export async function pickDocument(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
    copyToCacheDirectory: true,
  });
  const a = (r as any).assets?.[0];
  if ((r as any).canceled || !a) return null;
  return { uri: a.uri, fileName: a.name || `file_${Date.now()}`, mimeType: a.mimeType || 'application/octet-stream', size: a.size, isImage: (a.mimeType || '').startsWith('image/') };
}

/** Read a picked file's bytes for upload to Storage. On web the picker returns a
 *  blob:/data: URI that expo-file-system can't read, so we fetch it instead. */
export async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return await res.arrayBuffer();
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(b64);
}

export function attachmentIcon(mime?: string, name?: string): string {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf') || n.endsWith('.pdf')) return '📄';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return '📝';
  return '📎';
}

export const isWeb = Platform.OS === 'web';
