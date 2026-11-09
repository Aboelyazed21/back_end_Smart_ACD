export interface PasswordCheck {
  label: string;
  ok: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '12 حرفًا على الأقل', ok: password.length >= 12 },
    { label: 'حرف كبير وحرف صغير', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'رقم واحد على الأقل', ok: /\d/.test(password) },
    { label: 'رمز خاص', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}
