const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_POLICY_HELPER_TEXT =
  "কমপক্ষে ৮ অক্ষর এবং বড় হাতের অক্ষর, ছোট হাতের অক্ষর, সংখ্যা, বিশেষ অক্ষর - এই ৪টির মধ্যে অন্তত ৩টি থাকতে হবে।";

export function getPasswordPolicyError(password: string) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে";
  }

  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];

  if (checks.filter(Boolean).length < 3) {
    return "বড়-ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ অক্ষরের যেকোনো তিনটি থাকতে হবে";
  }

  return null;
}

export function assertStrongPassword(password: string) {
  const error = getPasswordPolicyError(password);
  if (error) {
    throw new Error(error);
  }
}

