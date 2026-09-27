import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { InterviewCvProfile } from "./interviewTypes";

// Only extracted text + AI summary are stored — never the original file.
function cvRef(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "interview_profile", "cv");
}

export async function getCvProfile(uid: string): Promise<InterviewCvProfile | null> {
  const snap = await getDoc(cvRef(uid));
  return snap.exists() ? (snap.data() as InterviewCvProfile) : null;
}

export async function saveCvProfile(uid: string, profile: InterviewCvProfile): Promise<void> {
  await setDoc(cvRef(uid), profile);
}

export async function deleteCvProfile(uid: string): Promise<void> {
  await deleteDoc(cvRef(uid));
}
