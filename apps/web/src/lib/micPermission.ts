export type MicPermission = "granted" | "denied" | "prompt" | "unsupported";

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export async function getMicPermission(): Promise<MicPermission> {
  if (!isRecordingSupported()) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    // Firefox/Safari may not support querying "microphone" — treat as askable.
    return "prompt";
  }
}

export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
